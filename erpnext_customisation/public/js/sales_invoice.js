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

