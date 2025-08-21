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
    """Create Delivery Note using ERPNext's built-in function"""
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
    """Get Items for POS"""
    items = frappe.get_all("Item",
        fields=["name", "item_name", "description", "image", "valuation_rate", "item_group"],
        filters={"is_sales_item": 1, "disabled": 0, "has_variants": 0},
        limit=100,
        order_by="creation desc"
    )
    return items

@frappe.whitelist()
def get_sales_orders_for_pos():
    """Get Sales Orders created from POS"""
    orders = frappe.get_all("Sales Order",
        fields=["name", "customer", "total", "status", "creation", "per_delivered", "per_billed"],
        filters={"order_type": "Sales", "docstatus": 1},
        order_by="creation desc",
        limit=50
    )
    return orders
