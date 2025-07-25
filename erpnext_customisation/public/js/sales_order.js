frappe.ui.form.on("Sales Order", {
    refresh: (frm) => {
        console.log("Customer:", frm.doc.customer);
    },

    custom_most_order: (frm) => {
        if (!frm.doc.customer) {
            frappe.msgprint('Please select a customer first');
            return;
        }

        frappe.call({
            method: 'erpnext_customisation.api.get_top_items',
            args: { customer: frm.doc.customer },
            callback: (r) => {
                if (!r.exc && r.message.length > 0) {
                    r.message.forEach(item => {
                        const existingItem = frm.doc.items.find(i => i.item_code === item.item_code);
                        if (existingItem) {
                            existingItem.qty += item.qty;
                            existingItem.rate = item.rate;
                        } else {
                            const child = frm.add_child('items');
                            child.item_code = item.item_code;
                            child.item_name = item.item_name;
                        }
                    });

                    frm.refresh_field('items');
                } else {
                    frappe.msgprint('No recent orders found for this customer');
                }
            }
        });
    }
});
