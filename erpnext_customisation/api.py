from frappe import whitelist
import frappe

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

