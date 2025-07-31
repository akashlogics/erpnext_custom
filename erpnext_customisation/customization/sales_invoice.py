import frappe
from frappe import whitelist

@frappe.whitelist()
def validate_customer_items(customer, item_code):

    return frappe.db.exists("Customer Item Detail", {
        "parent": customer,
        "item_code": item_code
    })

@frappe.whitelist()
def add_customer_item(customer, item_code):

    if not frappe.db.exists("Customer Item List", customer):
        customer_doc = frappe.get_doc({
            "doctype": "Customer Item List",
            "customer": customer
        })

    existing_items = [d.item_code for d in customer_doc.items]

    if item_code not in existing_items:
        customer_doc.append("items", {
            "item_code": item_code
        })
        customer_doc.save()

    return True

@frappe.whitelist()
def fetch_customer_items(customer):
    items = frappe.get_all(
        "Customer Item Detail",
        filters={"parent": customer},
        fields=["item_code"]
    )
    return [d.item_code for d in items]
