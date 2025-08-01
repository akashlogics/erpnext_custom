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
    fetch("https://fakestoreapi.in/api/products")
        .then(response => response.json())
        .then(data => {
            console.log("Fetched products:", data);
            if (data.status === "SUCCESS" && Array.isArray(data.products)) {
                allProducts = data.products;
                renderPage(currentPage);
            } else {
                frappe.msgprint("No products found.");
            }
        })
        .catch(error => {
            console.error("API fetch error:", error);
            frappe.msgprint("Failed to fetch products from the API.");
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

        card.innerHTML = `
            <div class="card mb-4 shadow-sm" h-100>
                <img src="${product.image}"
                    class="card-img-top"
                    style="height: 300px; object-fit: cover; background:#f5f5f5;"
                    alt="${product.title}">
                <div class="card-body">
                    <h5 class="card-title text-dark">${product.title.substring(0,30)}</h5>
                    <p class="card-text text-dark">${product.description.substring(0, 80)}</p>
                    <h6 class="text-success">₹ ${product.price}</h6>
                    <button class="btn btn-primary btn-sm add-to-cart-btn mt-2">Add to Items</button>
                </div>
            </div>
        `;

        container.appendChild(card);
        card.querySelector('.add-to-cart-btn').addEventListener('click', () => {
            addToCart(product);
        });
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

function addToCart(product) {
    frappe.call({
        method: "erpnext_customisation.customization.Item_add.create_item_from_store",
        args: {
            item_code: product.id,
            item_name: truncateString(product.title, 100),
            item_group: "Products",
            valuation_rate: product.price,
            description: product.description,
            image: product.image
        },
        callback: function(r) {
            if (r.message === "success") {
                frappe.msgprint(`Item "${product.title}" added successfully!`);
            }
            if (r.message === "exists") {
                frappe.msgprint(`Item already exists.`);
            }
        }
    });
}
