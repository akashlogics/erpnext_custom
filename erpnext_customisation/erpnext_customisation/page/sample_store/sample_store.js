let currentPage = 1;
const productsPerPage = 9;
let allProducts = [];
let existingOrdersMap = {};

function escapeString(str) {
    return (str || "")
        .replace(/\\/g, "\\\\")      // escape backslashes
        .replace(/\r?\n|\r/g, " ")   // remove line breaks
        .replace(/'/g, "\\'")
        .replace(/"/g, '\\"');       // escape double quotes
}

frappe.pages['sample-store'].on_page_load = function(wrapper) {
    frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Sample Store',
        single_column: true
    });

    $(wrapper).find('.layout-main-section').append(`
        <div class="container">
            <div class="row mb-3">
                <div class="col-12">
                    <h3>Fake Store Products</h3>
                </div>
            </div>
            <div class="row" id="product-cards"></div>
            <div class="row">
                <div class="col-12 d-flex justify-content-center">
                    <nav><ul class="pagination" id="pagination"></ul></nav>
                </div>
            </div>
        </div>
    `);

    fetchProducts();
};

function fetchProducts() {
    Promise.all([
        fetch("https://fakestoreapi.in/api/products").then(res => res.json()),
        fetchExistingOrders()
    ]).then(([data]) => {
        if (data.status === "SUCCESS" && Array.isArray(data.products)) {
            allProducts = data.products;
            renderPage(currentPage);
        } else {
            frappe.msgprint("No products found.");
        }
    }).catch(error => {
        console.error("API fetch error:", error);
        frappe.msgprint("Failed to fetch products from the API.");
    });
}

function fetchExistingOrders() {
    return new Promise((resolve) => {
        frappe.call({
            method: "erpnext_customisation.api.get_existing_fake_orders",
            callback: function(r) {
                existingOrdersMap = {};
                if (r.message) {
                    r.message.forEach(order => {
                        existingOrdersMap[String(order.item_code)] = {
                            status: order.purchase_status,
                            order_name: order.name,
                            purchase_order: order.purchase_order
                        };
                    });
                }
                resolve();
            }
        });
    });
}

function renderPage(page) {
    const startIndex = (page - 1) * productsPerPage;
    const endIndex = page * productsPerPage;
    renderCards(allProducts.slice(startIndex, endIndex));
    renderPagination();
}

function checkItemExists(itemCode) {
    return new Promise((resolve) => {
        frappe.call({
            method: "erpnext_customisation.api.item_exists",
            args: { item_code: itemCode },
            callback: function(r) {
                resolve(Boolean(r.message)); 
            }
        });
    });
}

async function renderCards(products) {
    const container = document.getElementById("product-cards");
    container.innerHTML = "";

    for (const product of products) {
        const pid = String(product.id);
        const itemExists = await checkItemExists(pid);
        const orderInfo = existingOrdersMap[pid];

        let actionButton = "";

        if (itemExists) {
            if (!orderInfo || orderInfo.status === "Completed") {
                actionButton = `<button class="btn btn-success btn-sm mt-1"
                    onclick="promptAddToStock('${pid}', 
                        '${escapeString(product.title)}', 
                        '${escapeString(product.description)}', 
                        ${product.price}, 
                        '${escapeString(product.image)}')">
                    Create Purchase Order
                </button>`;
            } else if (orderInfo && orderInfo.status === "PO created") {
                actionButton = `<button class="btn btn-success btn-sm mt-1"
                    onclick="createPurchaseReceipt('${orderInfo.purchase_order}', '${pid}')">
                    Create Purchase Receipt
                </button>`;
            }
        } else {
            actionButton = `<button class="btn btn-warning btn-sm mt-1"
                onclick="addToItems('${pid}', 
                    '${escapeString(product.title)}', 
                    '${escapeString(product.description)}', 
                    ${product.price}, 
                    '${escapeString(product.image)}')">
                Add to Items
            </button>`;
        }

        const statusBadge = orderInfo && orderInfo.status !== "Completed" 
            ? `<span class="badge badge-warning badge-lg px-3 py-2" style="font-size: 14px;">Status: ${orderInfo.status}</span>` 
            : "";

        const card = document.createElement("div");
        card.className = "col-md-4 mb-4";
        card.innerHTML = `
            <div class="card h-100">
                <img src="${product.image}" class="card-img-top" style="height: 200px; object-fit: contain;" alt="">
                <div class="card-body d-flex flex-column">
                    <h5 class="card-title">${product.title}</h5>
                    <p class="card-text text-dark">${truncateString(product.description, 130)}</p>
                    <p class="card-text text-dark"><strong>₹${product.price}</strong></p>
                    <div id="stock-${pid}" class="stock-info mb-2">
                        <span class="text-muted"> Stock Status...</span>
                    </div>
                    ${statusBadge ? `<div class="text-center mb-2">${statusBadge}</div>` : ''}
                    <div class="mt-auto">
                        ${actionButton}
                    </div>
                </div>
            </div>
        `;
        container.appendChild(card);
        
        if (itemExists) {
            fetchStockStatus(pid);
        }
    }
}

function truncateString(str, limit = 120) {
    if (!str) return "";
    return str.length > limit ? str.substring(0, limit) + "..." : str;
}

function fetchStockStatus(itemCode) {
    frappe.call({
        method: "erpnext_customisation.api.stockStatus",
        args: { item_code: itemCode },
        callback: function(r) {
            const el = document.getElementById(`stock-${itemCode}`);
            if (el) {
                const qty = parseFloat(r.message) || 0;
                el.innerHTML = qty > 0
                    ? `<strong class="text-success">Available Stock: ${qty}</strong>`
                    : `<strong class="text-danger">Available Stock: 0</strong>`;
            }
        }
    });
}

function promptAddToStock(pid, title, desc, price, image) {
    frappe.prompt(
        [
            {
                fieldname: 'qty',
                label: 'Quantity',
                fieldtype: 'Int',
                reqd: 1,
                default: 1
            }
        ],
        function(values){
            frappe.confirm(`Add ${values.qty} of "${title}" to stock?`, 
                () => {
                    addToStock(pid, title, desc, price, image, values.qty);
                },
                () => {}
            );
        },
        'Enter Quantity',
        'Submit'
    );
}

function addToStock(productId, title, description, price, image, qty) {
    frappe.call({
        method: "erpnext_customisation.api.create_fake_order",
        args: {
            item_code: String(productId),
            quantity: qty,
            item_name: truncateString(title, 30),
            description: description,
            rate: price,
            image: image
        },
        callback: function(r) {
            if (r.message && r.message.status === "success") {
                fetchExistingOrders().then(() => renderPage(currentPage));
            } else {
                const errorMsg = r.message?.message || "Failed to create order";
                frappe.msgprint(`Order Failed: ${errorMsg}`);
            }
        },
        freeze: true,
        freeze_message: __("Creating Purchase Order...")
    });
}

function addToItems(productId, title, description, price, image) {
    frappe.call({
        method: "erpnext_customisation.api.add_item",
        args: {
            item_code: String(productId),
            item_name: truncateString(title, 30),
            description: description,
            rate: price,
            image: image
        },
        callback: function(r) {
            if (r.message && r.message.status === "success") {
                frappe.msgprint({
                    title: __('Item Created'),
                    indicator: 'green',
                    message: `Item ${r.message.item_code} created successfully!`
                });
                fetchExistingOrders().then(() => renderPage(currentPage));
            } else {
                frappe.msgprint("Failed to create item.");
            }
        }
    });
}

function createPurchaseReceipt(purchaseOrder, itemCode) {
    frappe.call({
        method: "erpnext_customisation.api.add_purchase_receipt",
        args: { purchase_order: purchaseOrder },
        callback: function(r) {
            if (r.message && r.message.status === "success") {
                frappe.msgprint(`Purchase Receipt ${r.message.purchase_receipt} created successfully!`);
                
                frappe.call({
                    method: "frappe.client.set_value",
                    args: {
                        doctype: "Fake Store Order",
                        name: existingOrdersMap[itemCode].order_name,
                        fieldname: "purchase_status",
                        value: "Completed"
                    },
                    callback: function() {
                        fetchExistingOrders().then(() => renderPage(currentPage));
                    }
                });
            } else {
                frappe.msgprint("Failed to create Purchase Receipt.");
            }
        }
    });
}

function renderPagination() {
    const totalPages = Math.ceil(allProducts.length / productsPerPage);
    const pagCont = document.getElementById("pagination");
    pagCont.innerHTML = "";

    let prevLi = `<li class="page-item ${currentPage === 1 ? "disabled" : ""}">
        <a class="page-link" href="#" onclick="changePage(${currentPage - 1})">Previous</a>
    </li>`;
    pagCont.insertAdjacentHTML('beforeend', prevLi);

    for (let i = 1; i <= totalPages; i++) {
        let li = `<li class="page-item ${i === currentPage ? "active" : ""}">
            <a class="page-link" href="#" onclick="changePage(${i})">${i}</a>
        </li>`;
        pagCont.insertAdjacentHTML('beforeend', li);
    }

    let nextLi = `<li class="page-item ${currentPage === totalPages ? "disabled" : ""}">
        <a class="page-link" href="#" onclick="changePage(${currentPage + 1})">Next</a>
    </li>`;
    pagCont.insertAdjacentHTML('beforeend', nextLi);
}

function changePage(page) {
    const totalPages = Math.ceil(allProducts.length / productsPerPage);
    if (page >= 1 && page <= totalPages) {
        currentPage = page;
        renderPage(currentPage);
    }
}