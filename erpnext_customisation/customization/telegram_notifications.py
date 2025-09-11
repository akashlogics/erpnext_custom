import frappe
import requests
from frappe.utils import nowdate

TELEGRAM_BOT_TOKEN = "8263345147:AAHap__09QMcE_KYZiVhaA8JpaI8OR4QYIM"
TELEGRAM_API_URL = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}"

def send_order_notification(doc, method):
    """Called automatically when Sales Order is submitted"""
    try:
        # Get customer's Telegram ID
        telegram_id = frappe.get_value("Customer", doc.customer, "custom_telegram_id")
        
        if not telegram_id:
            frappe.log_error(f"No Telegram ID for customer: {doc.customer}")
            return
            
        # Prepare message
        message = f"""
🛒 <b>Order Confirmed!</b>

📋 <b>Order:</b> {doc.name}
👤 <b>Customer:</b> {doc.customer}
📅 <b>Date:</b> {doc.transaction_date}
💰 <b>Total:</b> ₹{doc.total}

<b>Items:</b>
"""
        
        for item in doc.items:
            message += f"• {item.item_name} - Qty: {item.qty} - ₹{item.amount}\n"
            
        message += f"\n🚚 <b>Expected Delivery:</b> {doc.delivery_date}"
        
        # Send notification
        send_telegram_message(telegram_id, message)
        
    except Exception as e:
        frappe.log_error(f"Order notification error: {str(e)}")

def send_invoice_notification(doc, method):
    """Called automatically when Sales Invoice is submitted"""
    try:
        # Get customer's Telegram ID
        telegram_id = frappe.get_value("Customer", doc.customer, "custom_telegram_id")
        
        if not telegram_id:
            return
            
        # Prepare message
        message = f"""
📋 <b>Invoice Generated</b>

🧾 <b>Invoice:</b> {doc.name}
👤 <b>Customer:</b> {doc.customer}
📅 <b>Due Date:</b> {doc.due_date}
💰 <b>Total:</b> ₹{doc.grand_total}
💳 <b>Outstanding:</b> ₹{doc.outstanding_amount}

Please make payment by the due date.
Thank you! 🙏
"""
        
        send_telegram_message(telegram_id, message)
        
    except Exception as e:
        frappe.log_error(f"Invoice notification error: {str(e)}")

def send_telegram_message(chat_id, message):
    """Helper function to send Telegram message"""
    try:
        url = f"{TELEGRAM_API_URL}/sendMessage"
        payload = {
            "chat_id": chat_id,
            "text": message,
            "parse_mode": "HTML"
        }
        
        response = requests.post(url, json=payload)
        
        if response.status_code == 200:
            frappe.logger().info(f"Telegram notification sent to {chat_id}")
        else:
            frappe.log_error(f"Telegram API Error: {response.text}")
            
    except Exception as e:
        frappe.log_error(f"Telegram send error: {str(e)}")

@frappe.whitelist()
def send_payment_reminders():
    """Scheduled function for payment reminders"""
    try:
        # Get overdue invoices
        overdue_invoices = frappe.db.sql("""
            SELECT name, customer, due_date, outstanding_amount,
                   DATEDIFF(CURDATE(), due_date) as days_overdue
            FROM `tabSales Invoice` 
            WHERE docstatus = 1 
            AND outstanding_amount > 0 
            AND due_date < CURDATE()
        """, as_dict=True)
        
        notifications_sent = 0
        
        for invoice in overdue_invoices:
            # Use consistent field name
            telegram_id = frappe.get_value("Customer", invoice.customer, "custom_telegram_id")
            
            if not telegram_id:
                frappe.log_error(f"No Telegram ID for customer: {invoice.customer}")
                continue
                
            urgency = "🚨 URGENT" if invoice.days_overdue > 7 else "⚠️ REMINDER"
            
            message = f"""
{urgency} <b>Payment Due</b>

🧾 <b>Invoice:</b> {invoice.name}
👤 <b>Customer:</b> {invoice.customer}
⏰ <b>Days Overdue:</b> {invoice.days_overdue}
💰 <b>Amount Due:</b> ₹{invoice.outstanding_amount}

Please settle this payment immediately.
"""
            
            result = send_telegram_message(telegram_id, message)
            if result:  # Add success tracking
                notifications_sent += 1
        
        frappe.log_error(f"Payment reminders sent: {notifications_sent}")
        return {"status": "success", "sent": notifications_sent}
            
    except Exception as e:
        frappe.log_error(f"Payment reminder error: {str(e)}")
        return {"status": "error", "message": str(e)}
