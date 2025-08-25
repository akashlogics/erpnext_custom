import frappe
import json
from frappe.utils import nowdate

@frappe.whitelist()
def create_sales_order_from_pos(customer, items):
    if isinstance(items, str):
        items = json.loads(items)

    sales_order = frappe.new_doc("Sales Order")
    sales_order.customer = customer
    sales_order.delivery_date = nowdate()
    sales_order.order_type = "Sales"
    sales_order.set_warehouse = "Stores - AD"

    for item_data in items:
        sales_order.append("items", {
            "item_code": item_data.get("item_code"),
            "qty": item_data.get("qty", 1),
            "rate": item_data.get("rate", 0),
            "delivery_date": nowdate()
        })

    sales_order.insert()
    sales_order.submit()
    
    return {
        "status": "success",
        "sales_order": sales_order.name,
        "total_amount": sales_order.total
    }

@frappe.whitelist()
def create_sales_invoice_from_so(sales_order_name):
    try:
        from erpnext.selling.doctype.sales_order.sales_order import make_sales_invoice
        
        si = make_sales_invoice(sales_order_name)
        si.insert()
        si.submit()
        
        return {
            "status": "success",
            "sales_invoice": si.name,
            "total_amount": si.total
        }
        
    except Exception as e:
        frappe.log_error(f"Sales Invoice creation failed: {str(e)}")
        return {"status": "error", "message": str(e)}

@frappe.whitelist()
def create_delivery_note_from_so(sales_order_name):
    try:
        from erpnext.selling.doctype.sales_order.sales_order import make_delivery_note
        
        dn = make_delivery_note(sales_order_name)
        dn.insert()
        dn.submit()
        
        return {
            "status": "success",
            "delivery_note": dn.name
        }
        
    except Exception as e:
        frappe.log_error(f"Delivery Note creation failed: {str(e)}")
        return {"status": "error", "message": str(e)}

@frappe.whitelist()
def get_items_for_pos():
    items = frappe.get_all("Item",
        fields=["name", "item_name", "description", "image", "valuation_rate", "item_group"],
        filters={"is_sales_item": 1, "disabled": 0, "has_variants": 0},
        limit=100,
        order_by="creation desc"
    )
    return items

@frappe.whitelist()
def get_sales_orders_for_pos():
    orders = frappe.get_all("Sales Order",
        fields=["name", "customer", "total", "status", "creation", "per_delivered", "per_billed"],
        filters={"order_type": "Sales", "docstatus": 1},
        order_by="creation desc",
        limit=50
    )
    return orders

@frappe.whitelist()
def create_payment_entry(sales_invoice_name, amount, mode_of_payment, remarks=''):
    """Create Payment Entry matching ERPNext UI requirements"""
    try:
        # Get the Sales Invoice
        invoice = frappe.get_doc('Sales Invoice', sales_invoice_name)
        
        if invoice.outstanding_amount <= 0:
            return {"status": "error", "message": "Invoice is already fully paid"}
        
        # Create Payment Entry
        payment = frappe.new_doc('Payment Entry')
        payment.payment_type = 'Receive'
        payment.posting_date = nowdate()
        payment.company = invoice.company
        payment.mode_of_payment = mode_of_payment
        payment.party_type = 'Customer'
        payment.party = invoice.customer
        payment.remarks = remarks
        
        payment.paid_from = invoice.debit_to  
        payment.paid_to = frappe.get_cached_value('Company', invoice.company, 'default_cash_account')  
        
        amount_to_pay = min(float(amount), invoice.outstanding_amount)
        payment.paid_amount = amount_to_pay
        payment.received_amount = amount_to_pay
        
        payment.paid_from_account_currency = invoice.currency
        payment.paid_to_account_currency = frappe.get_cached_value('Company', invoice.company, 'default_currency')
        payment.source_exchange_rate = 1.0
        payment.target_exchange_rate = 1.0
        
        payment.append('references', {
            'reference_doctype': 'Sales Invoice',
            'reference_name': sales_invoice_name,
            'total_amount': invoice.grand_total,
            'outstanding_amount': invoice.outstanding_amount,
            'allocated_amount': amount_to_pay
        })
        
        payment.insert()
        payment.submit()
        
        return {
            'status': 'success',
            'payment_entry': payment.name,
            'allocated_amount': amount_to_pay
        }
        
    except Exception as e:
        frappe.log_error(f'Payment Entry creation failed: {str(e)}')
        return {'status': 'error', 'message': str(e)}



@frappe.whitelist()
def get_sales_orders_with_payment_status():
    """Get Sales Orders with payment status - Simplified"""
    orders = frappe.db.sql("""
        SELECT 
            so.name,
            so.customer,
            so.total,
            so.status,
            so.creation,
            so.per_delivered,
            so.per_billed,
            CASE 
                WHEN si.name IS NOT NULL THEN si.outstanding_amount 
                ELSE so.total 
            END as outstanding_amount,
            si.name as sales_invoice
        FROM `tabSales Order` so
        LEFT JOIN `tabSales Invoice Item` sii ON sii.sales_order = so.name AND sii.docstatus = 1
        LEFT JOIN `tabSales Invoice` si ON si.name = sii.parent
        WHERE so.docstatus = 1
        GROUP BY so.name
        ORDER BY so.creation DESC
        LIMIT 50
    """, as_dict=True)
    
    return orders