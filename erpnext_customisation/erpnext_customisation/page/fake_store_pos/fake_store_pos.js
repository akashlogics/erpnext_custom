frappe.pages['fake-store-pos'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Fake Store POS',
        single_column: false
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
            <div class="row h-100">
                <!-- Products Panel -->
                <div class="col-md-8">
                    <div class="products-panel">
                        <input type="text" class="form-control mb-3" id="item-search" 
                               placeholder="🔍 Search items...">
                        <div class="items-grid" id="items-container">
                            <div class="text-center"><i class="fa fa-spinner fa-spin"></i> Loading items...</div>
                        </div>
                    </div>
                </div>
                <!-- Cart Panel -->
                <div class="col-md-4">
                    <div class="cart-panel">
                        <!-- Customer Selection -->
                        <div class="col-md-1 text-right">
                            <select class="form-control d-inline" id="customer-select" style="width: 200px; display: inline-block;">
                                <option value="Walking Customer">Walking Customer</option>
                            </select>
                        </div>
                        <!-- Cart Header -->
                        <div class="cart-header mb-2">
                            <h5><i class="fa fa-shopping-cart"></i> Cart</h5>
                            <span class="badge badge-primary" id="cart-count">0</span>
                        </div>
                        <!-- Cart Items -->
                        <div class="cart-items-container" id="cart-items">
                            <div class="empty-cart text-center text-muted py-4">
                                <i class="fa fa-shopping-cart fa-2x mb-2"></i>
                                <p>No items in cart</p>
                            </div>
                        </div>
                        <!-- Cart Totals -->
                        <div class="cart-totals mb-2">
                            <div class="totals-row">
                                <span>Total Items:</span>
                                <span id="total-items">0</span>
                            </div>
                            <div class="total-amount">
                                <span><strong>Total Amount:</strong></span>
                                <span><strong>₹<span id="total-amount">0.00</span></strong></span>
                            </div>
                        </div>
                        <!-- Action Buttons -->
                        <div class="workflow-section mb-2">
                            <button class="btn btn-success btn-block" id="create-so-btn" disabled>
                                <i class="fa fa-plus-circle"></i> Create Sales Order
                            </button>
                            <button class="btn btn-secondary btn-block mt-2" id="clear-cart">
                                <i class="fa fa-trash"></i> Clear Cart
                            </button>
                            <button class="btn btn-info btn-block mt-2" id="view-orders-main">
                                <i class="fa fa-list"></i> View Orders
                            </button>
                        </div>
                        <!-- Recent Orders -->
                        <div class="recent-orders mt-2" id="recent-orders">
                            <h6 class="mb-2"><i class="fa fa-clock-o"></i> Recent Orders</h6>
                            <div id="recent-orders-list">
                                <div class="text-center text-muted py-2">
                                    <i class="fa fa-history mb-2"></i>
                                    <p>No recent orders</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <!-- External CSS -->
            <link rel="stylesheet" type="text/css" href="/assets/erpnext_customisation/css/Styles.css">
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
            const invoiceBtn = order.per_billed < 100 
                ? `<button class="btn btn-xs btn-success" onclick="window.pos.create_invoice('${order.name}')">📄 Invoice</button>`
                : `<span class="badge badge-success">Invoiced</span>`;

            const deliveryBtn = order.per_delivered < 100 
                ? `<button class="btn btn-xs btn-info" onclick="window.pos.create_delivery('${order.name}')">🚚 Deliver</button>`
                : `<span class="badge badge-info">Delivered</span>`;

            const orderItem = $(`
                <div class="order-item">
                    <small><strong>${order.name}</strong></small><br>
                    <small>${order.customer} - ₹${order.total}</small><br>
                    <div class="mt-1">
                        ${invoiceBtn}
                        ${deliveryBtn}
                        <button class="btn btn-xs btn-outline-primary" onclick="frappe.set_route('Form', 'Sales Order', '${order.name}')"> View</button>
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


    truncate_description(text, wordLimit = 15) {
        if (!text) return '';
        const words = text.split(' ');
        if (words.length <= wordLimit) return text;
        return words.slice(0, wordLimit).join(' ') + '...';
    }

    render_items() {
        const container = document.getElementById('items-container');
        container.innerHTML = '';

        this.items.forEach(item => {
            const truncatedDesc = this.truncate_description(item.description, 15);
            
            const itemCard = $(`
                <div class="item-card" data-item-code="${item.name}">
                    <img src="${item.image || '/assets/erpnext_customisation/images/item-placeholder.svg'}"
                         style="width: 60px; height: 60px; object-fit: contain;" alt="${item.item_name}">
                    <h6 style="font-size: 12px; margin: 5px 0;">${item.item_name}</h6>
                    <p style="font-size: 10px; color: #666; margin: 3px 0; height: 25px; overflow: hidden;">
                        ${truncatedDesc}
                    </p>
                    <div style="color: #28a745; font-weight: bold;">₹${item.valuation_rate || 0}</div>
                    <button class="btn btn-primary btn-xs mt-1">Add</button>
                </div>
            `);

            itemCard.on('click', () => this.add_to_cart(item));
            container.appendChild(itemCard[0]);
        });

        this.load_recent_orders();
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

    render_cart() {
        const container = document.getElementById('cart-items');
        
        if (this.cart.length === 0) {
            container.innerHTML = '<p class="text-muted">No items in cart</p>';
            $('#create-so-btn').prop('disabled', true);
            return;
        }

        container.innerHTML = '';
        $('#create-so-btn').prop('disabled', false);

        this.cart.forEach((item, index) => {
            const cartItem = $(`
                <div class="cart-item">
                    <div class="row h-100" >
                        <div class="col-4">
                            <small><strong>${item.item_name}</strong></small>
                            <br><small>₹${item.rate} each</small>
                        </div>
                        <div class="col-5">
                            <div class="qty-controls">
                                <button class="btn btn-sm btn-outline-secondary" onclick="window.pos.update_qty(${index}, -1)">-</button>
                                <span class="mx-1">${item.qty}</span>
                                <button class="btn btn-sm btn-outline-secondary" onclick="window.pos.update_qty(${index}, 1)">+</button>
                            </div>
                            <div class="text-right mt-1">
                                <small>₹${(item.rate * item.qty).toFixed(2)}</small>
                            </div>
                        </div>
                    </div>
                </div>
            `);
            
            container.appendChild(cartItem[0]);
        });

        window.pos = this;
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
            const truncatedDesc = this.truncate_description(item.description, 15);
            
            const itemCard = $(`
                <div class="item-card" data-item-code="${item.name}">
                    <img src="${item.image || '/assets/erpnext/images/ui/item-placeholder.svg'}" 
                         style="width: 60px; height: 60px; object-fit: contain;" alt="${item.item_name}">
                    <h6 style="font-size: 12px; margin: 5px 0;">${item.item_name}</h6>
                    <p style="font-size: 10px; color: #666; margin: 3px 0; height: 25px; overflow: hidden;">
                        ${truncatedDesc}
                    </p>
                    <div style="color: #28a745; font-weight: bold;">₹${item.valuation_rate || 0}</div>
                    <button class="btn btn-primary btn-xs mt-1">Add</button>
                </div>
            `);

            itemCard.on('click', () => this.add_to_cart(item));
            container.appendChild(itemCard[0]);
        });
    }
}