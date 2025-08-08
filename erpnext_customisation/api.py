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
        fields=["name", "purchase_status", "item_code"],
        order_by="creation desc"
    )
    return orders

@frappe.whitelist()
def create_fake_order(item_code, quantity,item_name,description):
    if not frappe.db.exists("Item", item_code):
        item=frappe.get_doc({
            "doctype": "Item",
            "item_code": item_code,
            "item_name": item_name,
            "is_stock_item": 1,
            "stock_uom": "Nos",
            "item_group": "Products",
            "default_warehouse": "Stores - AD",
            "supplier": "MA Inc.",
            "description": description
        })
        item.insert()

    fake_order = frappe.get_doc({
        "doctype": "Fake Store Order",
        "warehouse": "Stores - AD",
        "supplier": "MA Inc.",
        "required_by": nowdate(),
        "purchase_status": "PO created",
        "item_code": item_code,
        "quantity": quantity
    })
    
    fake_order.insert()
    
    po = frappe.get_doc({
        "doctype": "Purchase Order",
        "supplier": fake_order.supplier,
        "schedule_date": nowdate(),
        "set_warehouse": fake_order.warehouse,
        "items": [
            {
                "item_code": item_code,
                "qty": quantity,
                "schedule_date": nowdate()
            }
        ]
    })
    po.insert()
    po.submit()


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
            }
        },
        None,
        postprocess
    )

    pr.insert()
    pr.submit()

    return {
        "status": "success",
        "purchase_receipt": pr.name
    }