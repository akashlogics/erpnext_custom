import json
import frappe
import requests
from frappe.utils import nowdate, get_site_url
from frappe import _
from erpnext_customisation.telegram.setup import setup_webhook
from frappe.utils.pdf import get_pdf
import tempfile
import os


TELEGRAM_BOT_TOKEN = "8263345147:AAHap__09QMcE_KYZiVhaA8JpaI8OR4QYIM"
TELEGRAM_API_URL = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}"

@frappe.whitelist(allow_guest=True)
def telegram_webhook():
    try:
        # Handle headers before anything else
        if frappe.local.request:
            # Clear any Expect headers
            if 'HTTP_EXPECT' in frappe.local.request.environ:
                del frappe.local.request.environ['HTTP_EXPECT']
            if hasattr(frappe.local.request, 'headers') and 'Expect' in frappe.local.request.headers:
                del frappe.local.request.headers['Expect']
        
        # Set response headers immediately
        frappe.local.response.http_status_code = 200
        frappe.local.response.headers = {
            'Content-Type': 'application/json',
            'Expect': '',
            'Connection': 'keep-alive'
        }
        
        # Get request data
        if frappe.request.method == "POST":
            if hasattr(frappe.request, 'data'):
                request_data = frappe.request.data
            else:
                request_data = frappe.request.get_data()
            
            if isinstance(request_data, bytes):
                request_data = request_data.decode('utf-8')
            
            # Parse JSON
            update_data = json.loads(request_data)
            
            # Process update in background to avoid timeout
            frappe.enqueue(
                'erpnext_customisation.telegram.webhook.process_telegram_update',
                update_data=update_data,
                queue='short'
            )
            
        # CRITICAL: Return proper response immediately
        return {"status": "ok"}
        
    except Exception as e:
        frappe.log_error(f"Telegram webhook error: {str(e)}", "Telegram Webhook")
        # Still return 200 to prevent Telegram retries
        frappe.local.response.http_status_code = 200
        return {"status": "error", "message": "processed"}

def process_telegram_update(update_data):
    """Background processing of Telegram updates"""
    try:
        chat_id = None
        message_text = None
        callback_data = None
        
        # Handle regular messages
        if 'message' in update_data:
            message = update_data['message']
            chat = message.get('chat', {})
            chat_id = chat.get('id')
            message_text = message.get('text', '').strip()
        
        # Handle button callbacks
        elif 'callback_query' in update_data:
            callback_query = update_data['callback_query']
            callback_data = callback_query.get('data')
            chat = callback_query['message']['chat']
            chat_id = chat.get('id')
            
            # Answer callback query
            answer_callback_query(callback_query['id'])
        
        if not chat_id:
            return
        
        # Process interactions
        if message_text:
            handle_text_message(chat_id, message_text)
        elif callback_data:
            handle_callback_query(chat_id, callback_data)
            
    except Exception as e:
        frappe.log_error(f"Error processing telegram update: {str(e)}", "Telegram Processing")

def handle_text_message(chat_id, text):
    """Handle text messages from users"""
    text_lower = text.lower().strip()
    
    if text_lower == '/start':
        send_welcome_message(chat_id)
    elif text_lower.startswith('/order '):
        # Extract order ID
        parts = text.split(' ', 1)
        if len(parts) > 1:
            order_id = parts[1].strip().upper()
            check_order_access(chat_id, order_id)
        else:
            send_message(chat_id, "❌ Please provide Order ID\nExample: /order SAL-ORD-2025-00001")
    elif text_lower.startswith('sal-ord-'):
        order_id = text.upper().strip()
        check_order_access(chat_id, order_id)
    else:
        send_message(chat_id, "👋 Send /start to see available options")

def handle_callback_query(chat_id, callback_data):
    """Handle button callbacks"""
    try:
        if callback_data == 'check_order':
            send_message(chat_id, "📋 Send your Order ID (e.g., SAL-ORD-2025-00001)")
        
        elif callback_data == 'my_orders':
            show_customer_orders(chat_id)
        
        elif callback_data.startswith('order_details:'):
            order_id = callback_data.split(':', 1)[1]
            generate_pdf_and_send(chat_id, order_id)
            
    except Exception as e:
        frappe.log_error(f"Callback error: {str(e)}", "Telegram Callback")
        send_message(chat_id, "❌ Error processing request")

def send_welcome_message(chat_id):
    """Send welcome message with options"""
    keyboard = {
        "inline_keyboard": [
            [
                {"text": "📋 Check Order", "callback_data": "check_order"},
                {"text": "📦 My Orders", "callback_data": "my_orders"}
            ]
        ]
    }
    
    message = """
🛒 <b>Welcome to Fake Store POS!</b>

Choose an option:
• <b>Check Order</b> - Get status of specific order
• <b>My Orders</b> - View your recent orders

You can also send order ID directly!
"""
    
    send_message(chat_id, message, keyboard)

def check_order_access(chat_id, order_id):
    """Check if order exists and user has access"""
    try:
        if not frappe.db.exists("Sales Order", order_id):
            send_message(chat_id, f"❌ Order {order_id} not found")
            return
        
        order = frappe.get_doc("Sales Order", order_id)
        
        # Check if customer has this telegram ID
        customer_telegram_id = frappe.get_value("Customer", order.customer, "custom_telegram_id")
        
        if str(customer_telegram_id) != str(chat_id):
            send_message(chat_id, "❌ You don't have access to this order")
            return
        
        show_order_options(chat_id, order_id)
        
    except Exception as e:
        frappe.log_error(f"Order access error: {str(e)}")
        send_message(chat_id, "❌ Error checking order")

def show_order_options(chat_id, order_id):
    """Show options for an order"""
    try:
        order = frappe.get_doc("Sales Order", order_id)
        
        keyboard = {
            "inline_keyboard": [
                [{"text": "📄 Order Details", "callback_data": f"order_details:{order_id}"}],
                [
                    {"text": "🧾 Invoice PDF", "callback_data": f"invoice_pdf:{order_id}"},
                    {"text": "🚚 Delivery PDF", "callback_data": f"delivery_pdf:{order_id}"}
                ]
            ]
        }
        
        message = f"""
📋 <b>Order: {order_id}</b>
👤 Customer: {order.customer}
💰 Total: ₹{order.total}
📊 Status: {order.status}

Choose an action:
"""
        
        send_message(chat_id, message, keyboard)
        
    except Exception as e:
        frappe.log_error(f"Show order error: {str(e)}")
        send_message(chat_id, "❌ Error loading order")

def send_telegram_document(chat_id, pdf_content, filename, reply_markup=None):
    """Send PDF file directly to Telegram with proper cleanup"""
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as temp_file:
            with open(temp_file.name, 'wb') as f:
                f.write(pdf_content)
            temp_path = temp_file.name

        try:
            url = f"{TELEGRAM_API_URL}/sendDocument"
            files = {'document': (filename, open(temp_path, 'rb'), 'application/pdf')}
            data = {
                'chat_id': chat_id,
                'caption': f'📄 {filename}',
                'reply_markup': json.dumps(reply_markup) if reply_markup else None
            }

            response = requests.post(url, files=files, data=data, timeout=30)
            
            if not response.ok:
                frappe.log_error(f"Telegram API Error ({response.status_code}): {response.text}")
                send_message(chat_id, "Failed to send document. Please try again.")

        finally:
            if os.path.exists(temp_path):
                os.unlink(temp_path)

    except IOError as e:
        frappe.log_error(f"Temp file error: {str(e)}")
        send_message(chat_id, "Error processing document")
    except Exception as e:
        frappe.log_error(f"Document send failed: {str(e)}")
        send_message(chat_id, "Failed to send document")
        
def send_message(chat_id, text, reply_markup=None):
    """Send message to Telegram"""
    try:
        url = f"{TELEGRAM_API_URL}/sendMessage"
        payload = {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "HTML"
        }
        
        if reply_markup:
            payload["reply_markup"] = reply_markup
        
        # Create session with proper headers
        session = requests.Session()
        session.headers.update({
            "Content-Type": "application/json",
            "Accept": "application/json"
        })
        response = session.post(url, json=payload, timeout=10)
        
        if response.status_code != 200:
            frappe.log_error(f"Telegram send error: {response.text}")
            
    except Exception as e:
        frappe.log_error(f"Send message error: {str(e)}")

def answer_callback_query(callback_query_id):
    """Answer callback query to remove loading state"""
    try:
        url = f"{TELEGRAM_API_URL}/answerCallbackQuery"
        payload = {"callback_query_id": callback_query_id}
        requests.post(url, json=payload, timeout=5)
    except:
        pass  # Non-critical

def show_customer_orders(chat_id):
    """Show customer's recent orders"""
    try:
        # Get customer's orders
        customer_orders = frappe.db.sql("""
            SELECT name, transaction_date, total, status
            FROM `tabSales Order`
            WHERE customer = (SELECT customer FROM `tabCustomer` WHERE custom_telegram_id = %s)
            ORDER BY transaction_date DESC
            LIMIT 5
        """, (chat_id,), as_dict=True)
        
        if not customer_orders:
            send_message(chat_id, "❌ No recent orders found")
            return
        
        buttons = []
        for order in customer_orders:
            buttons.append([{
                "text": f"{order.name} - ₹{order.total} ({order.status})",
                "callback_data": f"order_details:{order.name}"
            }]) 
        keyboard = {"inline_keyboard": buttons}
        send_message(chat_id, "📦 <b>Your Recent Orders:</b>", keyboard)
        
    except Exception as e:
        frappe.log_error(f"Customer orders error: {str(e)}")
        send_message(chat_id, "❌ Error loading orders")

def generate_pdf_and_send(chat_id, order_id):
    buttons_after_doc = {
        "inline_keyboard": [
            [
                {"text": "Orders", "callback_data": "menu_orders"},
                {"text": "Help", "callback_data": "menu_help"}
            ]
        ]
    }
    try:
        # Validate user permissions and document
        frappe.set_user("bot@gmail.com")
        if not frappe.has_permission("Sales Order", "read", order_id):
            send_message(chat_id, " Permission denied for this order")
            return
        if not frappe.db.exists("Sales Order", order_id):
            send_message(chat_id, f"Order <b>{order_id}</b> not found.", reply_markup=buttons_after_doc)
            return

        try:
            html = frappe.get_print("Sales Order", order_id, as_pdf=False)
            pdf_content = get_pdf(html)
            if not pdf_content:
                raise ValueError("Empty PDF content generated")
        except Exception as e:
            frappe.log_error(f"PDF generation failed: {str(e)}", "PDF Generation")
            send_message(chat_id, "❌ Failed to generate PDF content")
            return

        send_telegram_document(chat_id, pdf_content, f"{order_id}.pdf", reply_markup=buttons_after_doc)

    except Exception as e:
        frappe.log_error(f"PDF generation failed: {str(e)}", "PDF Generation")
        send_message(chat_id, f"❌ Failed to generate PDF for {order_id}. Please try again later.", reply_markup=buttons_after_doc)

        
def show_order_details(chat_id, order_id):
    """Show order details"""
    try:
        order = frappe.get_doc("Sales Order", order_id)    
        items = "\n".join([f"• {item.item_name} x {item.qty} - ₹{item.amount}" for item in order.items])
        message = f"""
📋 <b>Order: {order_id}</b>
👤 Customer: {order.customer}
🛒 Items:
{items}
        """
        send_message(chat_id, message)

    except Exception as e:
        frappe.log_error(f"Order details error: {str(e)}")
        send_message(chat_id, "❌ Error loading order details")

if __name__ == "__main__":
    setup_webhook()