from frappe import whitelist
import frappe
from frappe.model.mapper import get_mapped_doc
from frappe.utils import nowdate

@whitelist()
def get_top_items(customer):
    items = frappe.db.sql("""
        SELECT soi.item_name, soi.item_code,SUM(soi.qty) as total_qty,soi.rate
        FROM `tabSales Order Item` soi
        JOIN `tabSales Order` so ON soi.parent = so.name
        WHERE so.customer = %s
        AND so.docstatus = 1
        GROUP BY soi.item_code
        ORDER BY total_qty DESC
        LIMIT 2
    """, (customer,), as_dict=True)
    
    if not items:
        return []
    
    return items

@frappe.whitelist()
def get_existing_fake_orders():
    orders = frappe.get_all("Fake Store Order",
        fields=["name", "purchase_status", "item_code", "purchase_order"],
        order_by="creation desc"
    )
    return orders

@frappe.whitelist()
def item_exists(item_code):
    return bool(frappe.db.exists("Item", item_code))

@frappe.whitelist()
def add_item(item_code, item_name, description, rate, image):
    if not frappe.db.exists("Item", item_code):
        item = frappe.new_doc("Item")
        item.update({
            "doctype": "Item",
            "item_code": item_code,
            "item_name": item_name,
            "is_stock_item": 1,
            "stock_uom": "Nos",
            "item_group": "Products",
            "default_warehouse": "Stores - AD",
            "supplier": "MA Inc.",
            "description": description,
            "image": image,
            "valuation_rate": rate
        })
        item.insert()
        
        return {
            "status": "success",
            "item_code": item_code
        }
    else:
        return {
            "status": "error",
            "message": "Item already exists"
        }

@frappe.whitelist()
def create_fake_order(item_code, quantity, item_name, description, rate, image):
    existing_order = frappe.db.get_value("Fake Store Order", 
        {"item_code": item_code, "purchase_status": ["in", ["PO created", "Draft"]]}, 
        "name")
    
    if existing_order:
        return {
            "status": "error",
            "message": f"Purchase Order already exists for item {item_code}"
        }

    fake_order = frappe.new_doc("Fake Store Order")
    fake_order.update({
        "doctype": "Fake Store Order",
        "warehouse": "Stores - AD",
        "supplier": "MA Inc.",
        "required_by": nowdate(),
        "purchase_status": "PO created",
        "item_code": item_code,
        "quantity": quantity,
        "rate": rate
    })
    fake_order.insert()
    
    po = frappe.new_doc("Purchase Order")
    po.update({
        "doctype": "Purchase Order",
        "supplier": fake_order.supplier,
        "schedule_date": nowdate(),
        "set_warehouse": fake_order.warehouse,
        "items": [{
            "item_code": item_code,
            "qty": quantity,
            "schedule_date": nowdate(),
            "rate": fake_order.rate
        }]
    })
    po.insert()
    po.submit()
    
    frappe.db.set_value("Fake Store Order", fake_order.name, "purchase_order", po.name)
    
    return {
        "status": "success",
        "fake_order": fake_order.name,
        "purchase_order": po.name
    }

@frappe.whitelist()
def add_purchase_receipt(purchase_order):
    def postprocess(target, source):
        target.purchase_order_item = source.name
    
    pr = get_mapped_doc(
        "Purchase Order",
        purchase_order,
        {
            "Purchase Order": {
                "doctype": "Purchase Receipt",
                "field_map": {
                    "supplier": "supplier",
                    "name": "purchase_order",
                },
            },
            "Purchase Order Item": {
                "doctype": "Purchase Receipt Item",
                "field_map": {
                    "parent": "purchase_order",
                    "name": "purchase_order_item",
                },
            },
        },
        None,
        postprocess
    )
    
    try:
        pr.insert()
        pr.submit()
    except Exception as e:
        frappe.log_error(f"Purchase receipt creation failed: {str(e)}")
        return {"status": "error", "message": str(e)}
    
    return {
        "status": "success",
        "purchase_receipt": pr.name,
        "purchase_order": purchase_order
    }

@frappe.whitelist()
def stockStatus(item_code):
    """
    Fixed stock status function that properly handles single item codes
    """
    if not item_code:
        return 0
    
    # Get stock quantity for a single item
    result = frappe.db.sql("""
        SELECT COALESCE(SUM(actual_qty), 0) as total_qty
        FROM `tabBin`
        WHERE item_code = %s
    """, (item_code,), as_dict=True)
    
    return result[0]['total_qty'] if result else 0
