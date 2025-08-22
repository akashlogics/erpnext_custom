frappe.pages['fake-store-pos'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Fake Store POS',
        single_column: true
    });

    new FakeStorePOS(page);
};

class FakeStorePOS {
    constructor(page) {
        this.page = page;
        this.wrapper = $(page.body);
        this.cart = [];
        this.current_customer = "Select Customer";
        this.setup_page();
        this.load_items();
        this.load_customers();
    }

    setup_page() {
        this.wrapper.html(`
            <div class="row">
                <!-- Products Panel -->
                <div class="col-md-8">
                    <div class="frappe-card h-100">
                        <div class="frappe-card-head">
                            <div class="form-group">
                                <input type="text" class="form-control" id="item-search" 
                                       placeholder="🔍 Search items...">
                            </div>
                        </div>
                        <div class="frappe-card-body">
                            <div class="products-grid " id="items-container">
                                <div class="text-center">
                                    <i class="fa fa-spinner fa-spin fa-2x"></i>
                                    <p class="text-muted">Loading items...</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>  
                <!-- Cart Panel -->
                <div class="col-md-4">
                    <div class="frappe-card">
                        <!-- Customer Selection -->
                        <div class="frappe-card-head">
                            <h5 class="card-title">
                                <i class="fa fa-user text-muted"></i> Customer
                            </h5>
                            <select class="form-control input-sm" id="customer-select" style="width: 400px; display: inline-block;">
                                <option value="Walking Customer">Walking Customer</option>
                            </select>
                        </div>  
                        <!-- Cart Header -->
                        <div class="frappe-card-body">
                            <div class="row margin-bottom">
                                <div class="col-xs-6">
                                    <h5><i class="fa fa-shopping-cart text-primary"></i> Cart</h5>
                                </div>
                                <div class="col-xs-6 text-right">
                                    <span class="badge" id="cart-count">0</span>
                                </div>
                            </div>  
                            <!-- Cart Items -->
                            <div class="cart-items-section" id="cart-items">
                                <div class="text-center text-muted" style="padding: 40px 20px;">
                                    <i class="fa fa-shopping-cart fa-2x"></i>
                                    <p>No items in cart</p>
                                </div>
                            </div>  
                            <!-- Cart Totals -->
                            <div class="well well-sm">
                                <div class="row">
                                    <div class="col-xs-6">Total Items:</div>
                                    <div class="col-xs-6 text-right"><span id="total-items">0</span></div>
                                </div>
                                <div class="row">
                                    <div class="col-xs-6"><strong>Total Amount:</strong></div>
                                    <div class="col-xs-6 text-right"><strong>₹<span id="total-amount">0.00</span></strong></div>
                                </div>
                            </div>  
                            <!-- Action Buttons -->
                            <div class="btn-group-vertical btn-block margin-bottom">
                                <button class="btn btn-primary btn-lg" id="create-so-btn" disabled>
                                    <i class="fa fa-plus-circle"></i> Create Sales Order
                                </button>
                                <button class="btn btn-default" id="clear-cart">
                                    <i class="fa fa-trash"></i> Clear Cart
                                </button>
                                <button class="btn btn-sm btn-default" id="view-orders">
                                    <i class="fa fa-list"></i> View Orders
                                </button>
                            </div>
                        </div>  
                        <!-- Recent Orders -->
                        <div class="frappe-card-footer">
                            <h6 class="text-muted">
                                <i class="fa fa-clock-o"></i> Recent Orders
                            </h6>
                            <div id="recent-orders-list" style="max-height: 200px; overflow-y: auto;">
                                <div class="text-center text-muted" style="padding: 20px;">
                                    <i class="fa fa-history"></i>
                                    <p>No recent orders</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div> 
            <style>
                /* Use ERPNext's card system */
                .frappe-card {
                    background: white;
                    border: 1px solid #d1d8dd;
                    border-radius: 6px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                    margin-bottom: 15px;
                }   
                .frappe-card-head {
                    padding: 15px;
                    border-bottom: 1px solid #f5f5f5;
                    background: #fafbfc;
                    border-radius: 6px 6px 0 0;
                }   
                .frappe-card-body {
                    padding: 15px;
                }   
                .frappe-card-footer {
                    padding-top: 8px;
                    border-top: 1px solid #f5f5f5;
                }
                /* Products Grid - Use flexbox with Bootstrap */
                .products-grid {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 15px;
                    max-height: 600px;
                    overflow-y: auto;
                }   
                /* Product Cards using Bootstrap card system */
                .product-card {
                    flex: 0 0 calc(25% - 15px);
                    min-width: 180px;
                }   
                /* Cart Items styling */
                .cart-items-section {
                    min-height: 200px;
                    max-height: 250px;
                    overflow-y: auto;
                    margin-bottom: 15px;
                }   
                .cart-item {
                    padding: 10px;
                    border-bottom: 1px solid #f5f5f5;
                    background: #fafbfc;
                    border-radius: 4px;
                    margin-bottom: 8px;
                }   
                /* Responsive adjustments */
                @media (max-width: 768px) {
                    .product-card {
                        flex: 0 0 calc(50% - 15px);
                        min-width: 150px;
                    }
                }
            </style>
        `); 
        this.bind_events();
    }

    bind_events() {
        $('#customer-select').on('change', (e) => {
            this.current_customer = e.target.value;
        });
        $('#view-orders').on('click', () => frappe.set_route('List', 'Sales Order'));
        $('#create-so-btn').on('click', () => this.create_sales_order());
        $('#clear-cart').on('click', () => this.clear_cart());
        $('#item-search').on('input', (e) => this.filter_items(e.target.value));
    }

    load_customers() {
        frappe.call({
            method: "frappe.client.get_list",
            args: {
                doctype: "Customer",
                fields: ["name", "customer_name"],
                filters: {"disabled": 0},
                limit: 50
            },
            callback: (r) => {
                if (r.message) {
                    const customerSelect = $('#customer-select');
                    customerSelect.empty();
                    
                    r.message.forEach(customer => {
                        customerSelect.append(`<option value="${customer.name}">${customer.customer_name}</option>`);
                    });
                }
            }
        });
    }

    load_items() {
        frappe.call({
            method: "erpnext_customisation.customization.fake_store_pos.get_items_for_pos",
            callback: (r) => {
                if (r.message) {
                    this.items = r.message;
                    this.render_items();
                }
            }
        });
    }

    load_recent_orders() {
        frappe.call({
            method: "erpnext_customisation.customization.fake_store_pos.get_sales_orders_for_pos",
            callback: (r) => {
                if (r.message && r.message.length > 0) {
                    this.render_recent_orders(r.message.slice(0, 3)); // Show only 3 recent
                }
            }
        });
    }

    render_recent_orders(orders) {
        const container = document.getElementById('recent-orders-list');
        container.innerHTML = '';

        orders.forEach(order => {
            const outstanding = order.outstanding_amount || 0;
            const isPaid = outstanding <= 0;

            // Payment button - works for all scenarios
            let paymentBtn = '';
            let paymentStatus = '';

            if (order.sales_invoice) {
                // Invoice exists - check payment status
                if (isPaid) {
                    paymentBtn = `<button class="btn btn-success btn-xs" disabled>
                        <i class="fa fa-check"></i> Paid
                    </button>`;
                    paymentStatus = `<span class="label label-success">Paid</span>`;
                } else {
                    paymentBtn = `<button class="btn btn-warning btn-xs" 
                        onclick="window.pos.open_payment_dialog('${order.sales_invoice}', ${outstanding})">
                        <i class="fa fa-money"></i> Pay ₹${outstanding.toFixed(2)}
                    </button>`;
                    paymentStatus = `<span class="label label-warning">Due: ₹${outstanding.toFixed(2)}</span>`;
                }
            } else {
                // No invoice yet - can still accept advance payment if needed
                paymentBtn = `<button class="btn btn-outline-warning btn-xs" 
                    onclick="frappe.msgprint('Create invoice first to record payment')">
                    <i class="fa fa-money"></i> Payment
                </button>`;
                paymentStatus = `<span class="label label-default">No Invoice</span>`;
            }

            // Invoice button
            const invoiceBtn = order.per_billed < 100 ? 
                `<button class="btn btn-success btn-xs" onclick="window.pos.create_invoice('${order.name}')">
                    <i class="fa fa-file-text"></i> Invoice
                </button>` : 
                `<span class="label label-success">Invoiced</span>`;

            // Delivery button
            const deliveryBtn = order.per_delivered < 100 ? 
                `<button class="btn btn-info btn-xs" onclick="window.pos.create_delivery('${order.name}')">
                    <i class="fa fa-truck"></i> Deliver
                </button>` : 
                `<span class="label label-info">Delivered</span>`;

            const orderItem = $(`
                <div class="list-group-item">
                    <div class="row">
                        <div class="col-xs-5">
                            <strong class="text-primary">${order.name}</strong><br>
                            <small class="text-muted">${order.customer}</small><br>
                            <small>Total: ₹${order.total}</small>
                        </div>
                        <div class="col-xs-3">
                            ${paymentStatus}
                            <button class="btn btn-default btn-xs" 
                                    onclick="frappe.set_route('Form', 'Sales Order', '${order.name}')">
                                <i class="fa fa-eye"></i> View
                            </button>
                        </div>
                        <div class="col-xs-4 text-right">
                            ${paymentBtn}<br>
                            ${invoiceBtn}<br>
                            ${deliveryBtn}<br>
                        </div>
                    </div>
                </div>
            `);
            
            container.appendChild(orderItem[0]);
        });

        window.pos = this;
    }

    create_invoice(sales_order_name) {
        frappe.call({
            method: "erpnext_customisation.fake_store_pos.create_sales_invoice_from_so",
            args: { sales_order_name: sales_order_name },
            callback: (r) => {
                if (r.message && r.message.status === "success") {
                    frappe.show_alert({
                        message: `Sales Invoice ${r.message.sales_invoice} created! Amount: ₹${r.message.total_amount}`,
                        indicator: 'green'
                    });
                    this.load_recent_orders(); // Refresh
                } else {
                    frappe.show_alert({
                        message: "Failed to create Sales Invoice",
                        indicator: 'red'
                    });
                }
            }
        });
    }

    create_delivery(sales_order_name) {
        frappe.call({
            method: "erpnext_customisation.fake_store_pos.create_delivery_note_from_so",
            args: { sales_order_name: sales_order_name },
            callback: (r) => {
                if (r.message && r.message.status === "success") {
                    frappe.show_alert({
                        message: `Delivery Note ${r.message.delivery_note} created!`,
                        indicator: 'green'
                    });
                    this.load_recent_orders(); // Refresh
                } else {
                    frappe.show_alert({
                        message: "Failed to create Delivery Note",
                        indicator: 'red'
                    });
                }
            }
        });
    }

    create_invoice_route(sales_order_name) {
        frappe.new_doc("Sales Invoice", {
            "sales_order": sales_order_name
        });
    }

    create_delivery_route(sales_order_name) {
        frappe.new_doc("Delivery Note", {
            "sales_order": sales_order_name
        });
    }

    render_cart() {
        const container = document.getElementById('cart-items');
        
        if (this.cart.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted" style="padding: 40px 20px;">
                    <i class="fa fa-shopping-cart fa-2x"></i>
                    <p>No items in cart</p>
                </div>
            `;
            $('#create-so-btn').prop('disabled', true);
            return;
        }

        container.innerHTML = '';
        $('#create-so-btn').prop('disabled', false);

        this.cart.forEach((item, index) => {
            // Use Bootstrap list group item
            const cartItem = $(`
                <div class="cart-item">
                    <div class="row">
                        <div class="col-xs-7">
                            <strong class="text-dark">${item.item_name}</strong><br>
                            <small class="text-muted">₹${item.rate} each</small>
                        </div>
                        <div class="col-xs-5">
                            <div class="btn-group btn-group-xs" style="display: flex; align-items: center; gap: 5px;">
                                <button class="btn btn-default" onclick="window.pos.update_qty(${index}, -1)">
                                    <i class="fa fa-minus"></i>
                                </button>
                                <span class="badge badge-info" style="min-width: 30px;">${item.qty}</span>
                                <button class="btn btn-default" onclick="window.pos.update_qty(${index}, 1)">
                                    <i class="fa fa-plus"></i>
                                </button>
                            </div>
                            <div class="text-right margin-top">
                                <strong class="text-primary">₹${(item.rate * item.qty).toFixed(2)}</strong>
                            </div>
                        </div>
                    </div>
                </div>
            `);
            
            container.appendChild(cartItem[0]);
        });

        window.pos = this;
    }

    add_to_cart(item) {
        const existingItem = this.cart.find(cartItem => cartItem.item_code === item.name);
        
        if (existingItem) {
            existingItem.qty += 1;
        } else {
            this.cart.push({
                item_code: item.name,
                item_name: item.item_name,
                rate: item.valuation_rate || 0,
                qty: 1
            });
        }
        
        this.render_cart();
        this.update_totals();
    }

    render_items() {
        const container = document.getElementById('items-container');
        container.innerHTML = '';
        
        this.items.forEach(item => {
            
            // Use Bootstrap card component
            const itemCard = $(`
                <div class="product-card h-100">
                    <div class="card">
                        <img src="${item.image || '/assets/erpnext/images/ui/item-placeholder.svg'}" 
                             class="card-img-top" style="height: 120px; object-fit: contain; padding: 10px;" 
                             alt="${item.item_name}">
                        <div class="card-body">
                            <h5 class="card-title" style="height: 40px; overflow: hidden;">
                                ${item.item_name}
                            </h5>
                            <p class="text-success"><strong>₹${item.valuation_rate || 0}</strong></p>
                            <button class="btn btn-primary btn-sm btn-block">
                                <i class="fa fa-plus"></i> Add
                            </button>
                        </div>
                    </div>
                </div>
            `);
            
            itemCard.on('click', () => this.add_to_cart(item));
            container.appendChild(itemCard[0]);
        });
    
        this.load_recent_orders();
    }


    update_qty(index, change) {
        if (this.cart[index]) {
            this.cart[index].qty += change;
            
            if (this.cart[index].qty <= 0) {
                this.cart.splice(index, 1);
            }
            
            this.render_cart();
            this.update_totals();
        }
    }

    update_totals() {
        const totalItems = this.cart.reduce((sum, item) => sum + item.qty, 0);
        const totalAmount = this.cart.reduce((sum, item) => sum + (item.rate * item.qty), 0);

        $('#total-items').text(totalItems);
        $('#total-amount').text(totalAmount.toFixed(2));
        $('#cart-count').text(totalItems); // update the badge
    }


    create_sales_order() {
        if (this.cart.length === 0) return;

        frappe.call({
            method: "erpnext_customisation.customization.fake_store_pos.create_sales_order_from_pos",
            args: {
                customer: this.current_customer,
                items: this.cart
            },

            callback: (r) => {
                if (r.message && r.message.status === "success") {
                    frappe.show_alert({
                        message: `Sales Order ${r.message.sales_order} created! Amount: ₹${r.message.total_amount}`,
                        indicator: 'green'
                    });
                    
                    this.clear_cart();
                    this.load_recent_orders(); 
                } else {
                    frappe.show_alert({
                        message: "Failed to create Sales Order",
                        indicator: 'red'
                    });
                }
            }
        });
    }

    create_invoice(sales_order_name) {
        frappe.call({
            method: "erpnext_customisation.customization.fake_store_pos.create_sales_invoice_from_so",
            args: { sales_order_name: sales_order_name },
            callback: (r) => {
                if (r.message && r.message.status === "success") {
                    frappe.show_alert({
                        message: `Sales Invoice ${r.message.sales_invoice} created!`,
                        indicator: 'green'
                    });
                    this.load_recent_orders();
                }
            }
        });
    }

    create_delivery(sales_order_name) {
        frappe.call({
            method: "erpnext_customisation.customization.fake_store_pos.create_delivery_note_from_so",
            args: { sales_order_name: sales_order_name },
            callback: (r) => {
                if (r.message && r.message.status === "success") {
                    frappe.show_alert({
                        message: `Delivery Note ${r.message.delivery_note} created!`,
                        indicator: 'green'
                    });
                    this.load_recent_orders();
                }
            }
        });
    }

    clear_cart() {
        this.cart = [];
        this.render_cart();
        this.update_totals();
    }

    filter_items(searchTerm) {
        if (!searchTerm) {
            this.render_items();
            return;
        }
        
        const filtered = this.items.filter(item => 
            item.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (item.description && item.description.toLowerCase().includes(searchTerm.toLowerCase()))
        );
        
        const container = document.getElementById('items-container');
        container.innerHTML = '';
        
        filtered.forEach(item => {

            const itemCard = $(`
                <div class="item-card" data-item-code="${item.name}">
                    <img src="${item.image || '/assets/erpnext/images/ui/item-placeholder.svg'}" 
                         style="width: 60px; height: 60px; object-fit: contain;" alt="${item.item_name}">
                    <h5 style="font-size: 12px; margin: 5px 0;">${item.item_name}</h5>
                    <div style="color: #28a745; font-weight: bold;">₹${item.valuation_rate || 0}</div>
                    <button class="btn btn-primary btn-xs mt-1">Add</button>
                </div>
            `);

            itemCard.on('click', () => this.add_to_cart(item));
            container.appendChild(itemCard[0]);
        });
    }

    open_payment_dialog(sales_invoice_name, outstanding_amount) {
        if (!sales_invoice_name) {
            frappe.throw('No invoice found for this order. Please create an invoice first.');
            return;
        }

        frappe.prompt([
            {
                fieldname: 'amount',
                label: 'Amount to Pay',
                fieldtype: 'Currency',
                default: outstanding_amount,
                reqd: 1
            },
            {
                fieldname: 'mode_of_payment',
                label: 'Payment Mode',
                fieldtype: 'Select',
                options: 'Cash\nBank Draft\nCheque\nCredit Card\nWire Transfer',
                default: 'Cash',
                reqd: 1
            },
            {
                fieldname: 'remarks',
                label: 'Remarks',
                fieldtype: 'Small Text',
                placeholder: 'Optional payment notes'
            }
        ], 
        (values) => {
            if (values.amount > outstanding_amount) {
                frappe.confirm(
                    `Payment amount (₹${values.amount}) exceeds outstanding amount (₹${outstanding_amount}). Continue?`,
                    () => this.process_payment(sales_invoice_name, values)
                );
            } else {
                this.process_payment(sales_invoice_name, values);
            }
        },
        'Record Payment',
        'Record Payment'
        );
    }
    process_payment(sales_invoice_name, values) {
        frappe.call({
            method: "erpnext_customisation.customization.fake_store_pos.create_payment_entry",
            args: {
                sales_invoice_name: sales_invoice_name,
                amount: values.amount,
                mode_of_payment: values.mode_of_payment,
                remarks: values.remarks || ''
            },
            callback: (r) => {
                if (r.message && r.message.status === "success") {
                    frappe.show_alert({
                        message: `Payment of ₹${values.amount} recorded successfully!<br>Payment Entry: ${r.message.payment_entry}`,
                        indicator: "green"
                    });
                    this.load_recent_orders();
                } else {
                    frappe.show_alert({
                        message: r.message ? r.message.message : "Payment failed",
                        indicator: "red"
                    });
                }
            }
        });
    }

    load_recent_orders() {
        frappe.call({
            method: "erpnext_customisation.customization.fake_store_pos.get_sales_orders_with_payment_status",
            callback: (r) => {
                if (r.message && r.message.length > 0) {
                    this.render_recent_orders(r.message.slice(0, 5));
                } else {
                    const container = document.getElementById('recent-orders-list');
                    container.innerHTML = `
                        <div class="text-center text-muted py-3">
                            <i class="fa fa-history"></i>
                            <p>No recent orders</p>
                        </div>
                    `;
                }
            },
            error: (r) => {
                console.error("Error loading recent orders:", r);
                frappe.show_alert({
                    message: "Failed to load recent orders",
                    indicator: "red"
                });
            }
        });
    }
}