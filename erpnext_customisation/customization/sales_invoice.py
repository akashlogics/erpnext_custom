import frappe

def validate_customer_items(doc, method):
    if not doc.customer:
        return

    customer_item_entries = frappe.get_all(
        "Customer Item Detail",
        filters={"parent": doc.customer},
        fields=["item_code"]
    )

    if not customer_item_entries:
        return

    allowed_item_codes = {entry["item_code"] for entry in customer_item_entries}

    for item in doc.items:
        if item.item_code not in allowed_item_codes:
            frappe.throw(
                f"Item {item.item_code} is not allowed for customer {doc.customer}. "
                "Please check Customer Items list."
            )