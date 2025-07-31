frappe.ui.form.on("Sales Invoice", {
    before_save: async function(frm) {
        if (!frm.doc.customer || !frm.doc.items.length) {
            return;
        }

        let missing_items = [];

        for (let row of frm.doc.items) {
            const res = await frappe.call({
                method: "erpnext_customisation.customization.sales_invoice.validate_customer_items",
                args: {
                    customer: frm.doc.customer,
                    item_code: row.item_code
                }
            });

            if (!res.message) {
                missing_items.push(row.item_code);
            }
        }

        if (missing_items.length) {
            await new Promise((resolve) => {
                frappe.confirm(
                    `The following items are not allowed for customer ${frm.doc.customer}:${missing_items.join(", ")}Do you want to add them to the Customer Item List?`,
                    async () => {
                        for (let item_code of missing_items) {
                            await frappe.call({
                                method: "erpnext_customisation.customization.sales_invoice.add_customer_item",
                                args: {
                                    customer: frm.doc.customer,
                                    item_code: item_code
                                }
                            });
                        }
                        frappe.show_alert("Items added.");
                        resolve();
                    },
                    () => {
                        frappe.throw("Cannot proceed. Item(s) not allowed.");
                        resolve();
                    }
                );
            });
        }
    }
});

frappe.ui.form.on('Sales Invoice', {
    refresh: function(frm) {
        frm.add_custom_button('Fetch All Items', async function() {
            if (!frm.doc.customer) {
                frappe.msgprint('Please select a customer first.');
                return;
            }

            const res = await frappe.call({
                method: "erpnext_customisation.customization.sales_invoice.fetch_customer_items",
                args: {
                    customer: frm.doc.customer
                }
            });

            if (res.message && res.message.length) {
                const existing_item_codes = frm.doc.items.map(item => item.item_code);

                res.message.forEach(item_code => {
                    if (!existing_item_codes.includes(item_code)) {
                        const child = frm.add_child('items');
                        child.item_code = item_code;
                    }
                    else {
                        frappe.msgprint(`Item ${item_code} already exists in the invoice.`);
                    }
                });

                frm.refresh_field('items');
                frappe.show_alert('Customer items fetched.');
            } else {
                frappe.msgprint("No items found in Customer Item List.");
            }
        });
    }
});
