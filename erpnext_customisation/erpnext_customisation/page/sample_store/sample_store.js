let currentPage = 1;
const productsPerPage = 9;
let allProducts = [];

frappe.pages['sample-store'].on_page_load = function(wrapper) {
    let page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Sample Store',
        single_column: true
    });

    $(page.body).append(`
        <div class="row" id="product-cards" style="margin-top: 20px;"></div>
        <div class="row justify-content-center" id="pagination" style="margin: 20px 0;"></div>
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

let existingOrdersMap = {};

function fetchExistingOrders() {
    return new Promise((resolve) => {
        frappe.call({
            method: "erpnext_customisation.api.get_existing_fake_orders",
            callback: function (r) {
                if (r.message) {
                    r.message.forEach(order => {
                        existingOrdersMap[order.item_code] = {
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
    const productsToShow = allProducts.slice(startIndex, endIndex);

    renderCards(productsToShow);
    renderPagination();
}

function renderCards(products) {
    const container = document.getElementById("product-cards");
    container.innerHTML = "";

    products.forEach(product => {
        const card = document.createElement("div");
        card.className = "col-md-4";

        const orderInfo = existingOrdersMap[product.id];

        const statusBadge = orderInfo && orderInfo.status !== "Completed"
            ? `<span class="badge bg-success">Status: ${orderInfo.status}</span>`
            : "";
        
        const addToStockButton = (!orderInfo || orderInfo?.status === "Completed")
            ? `<button class="btn btn-primary btn-sm mt-2 add-to-stock-btn">Add to Stock</button>`
            : "";
        const prBtn = orderInfo && orderInfo.status === "PO created"
            ? `<button class="btn btn-primary btn-sm mt-2 create-pr-btn">Create Purchase Receipt</button>`
            : "";

        card.innerHTML = `
            <div class="card mb-4 shadow-sm h-100">
                <img src="${product.image}" class="card-img-top" style="height: 300px; object-fit: cover; background:#f5f5f5;" alt="${product.title}">
                <div class="card-body">
                    <h5 class="card-title text-dark">${product.title.substring(0,30)}</h5>
                    <p class="card-text text-dark">${product.description.substring(0, 80)}</p>
                    <h6 class="text-success">₹ ${product.price}</h6>
                    ${statusBadge}
                    ${addToStockButton}
                    ${prBtn}
                </div>
            </div>
        `;
        
        container.appendChild(card);

        if (addToStockButton) {
            card.querySelector('.add-to-stock-btn').addEventListener('click', () => {
                addToStock(product);
            });
        }
        if (prBtn) {
            card.querySelector('.create-pr-btn').addEventListener('click', () => {
                updateStockStatusAndButton(orderInfo.purchase_order);
            });
        }
    });
}

function renderPagination() {
    const paginationContainer = document.getElementById("pagination");
    paginationContainer.innerHTML = "";

    const totalPages = Math.ceil(allProducts.length / productsPerPage);

    for (let i = 1; i <= totalPages; i++) {
        const button = document.createElement("button");
        button.className = `btn btn-sm ${i === currentPage ? 'btn-success' : 'btn-outline-primary'} mx-1`;
        button.innerText = i;
        button.onclick = () => {
            currentPage = i;
            renderPage(i);
        };
        paginationContainer.appendChild(button);
    }
}

function truncateString(str, maxlength) {
    return str.length > maxlength ? str.slice(0, maxlength) + '...' : str;
}

function addToStock(product) {
    let d = new frappe.ui.Dialog({
        title: `Add "${product.title}" to Stock`,
        fields: [
            {
                label: 'Quantity',
                fieldname: 'quantity',
                fieldtype: 'Int',
                reqd: true,
                default: 1
            }
        ],
        primary_action_label: 'Confirm',
        primary_action(values) {
            d.hide();

            frappe.call({
                method: "erpnext_customisation.api.create_fake_order",
                args: {
                    item_code: product.id,
                    quantity: values.quantity,
                    item_name: truncateString(product.title,50),
                    description: truncateString(product.description, 100),
                    rate: product.price,
                    image: product.image
                },
                callback: function (r) {
                    if (r.message.status === "success") {
                        frappe.msgprint(`
                            <b>Fake Store Order:</b> <a href="/app/fake-store-order/${r.message.fake_order}" target="_blank">${r.message.fake_order}</a><br>
                            <b>Purchase Order:</b> <a href="/app/purchase-order/${r.message.purchase_order}" target="_blank">${r.message.purchase_order}</a>
                        `);
                        existingOrdersMap[product.id] = {
                            status: "PO created",
                            order_name: r.message.fake_order,
                            purchase_order: r.message.purchase_order
                        };
                        fetchProducts();
                        
                    } else {
                        frappe.msgprint("Failed to create order: " + (r.message.error || 'Unknown error'));
                    }
                }
            });
        }
    });

    d.show();
}
function updateStockStatusAndButton(purchase_order_name) {
    frappe.call({
        method: "erpnext_customisation.api.add_purchase_receipt",
        args: {
            purchase_order: purchase_order_name
        },
        callback: function(r) {
            if (r.message && r.message.status === "success") {
                let productId;
                for (const [itemCode, orderInfo] of Object.entries(existingOrdersMap)) {
                    if (orderInfo.purchase_order === purchase_order_name) {
                        productId = itemCode;
                        break;
                    }
                }

                if (productId) {
                    frappe.db.set_value("Fake Store Order", existingOrdersMap[productId].order_name, {
                        "purchase_status": "Completed"
                    }).then(() => {
                        existingOrdersMap[productId].status = "Completed";
                        fetchProducts();
                    }).catch((error) => {
                        frappe.msgprint("Failed to update status: " + error.message);
                    });
                }

                const receiptLink = r.message.purchase_receipt ?
                    `<a href="/app/purchase-receipt/${r.message.purchase_receipt}" target="_blank">${r.message.purchase_receipt}</a>` :
                    'Not Available';
                
                frappe.msgprint(`
                    <div style="min-width: 300px">
                        <h5>Purchase Receipt Created</h5>
                        <p>${receiptLink}</p>
                        <p>Status: Completed</p>
                    </div>
                `);
                fetchProducts();
            } else {
                frappe.msgprint("Failed to create purchase receipt.");
            }
        }
    });
}