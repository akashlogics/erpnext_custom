import frappe

@frappe.whitelist()
def create_item_from_store(item_code, item_name, item_group, valuation_rate, description, image):
    if frappe.db.exists("Item", item_code):
        return "exists"

    item = frappe.new_doc("Item")
    item.item_code = str(item_code)
    item.item_name = item_name
    item.item_group = item_group
    item.valuation_rate = float(valuation_rate)
    item.description = description
    item.stock_uom = "Nos"  
    item.is_stock_item = 1
    item.image =image
    item.save()
    return "success"