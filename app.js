import { auth, db, functions } from "./config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    where
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-functions.js";

const FREE_DELIVERY_THRESHOLD = 35000;
const DELIVERY_FEE = 2000;
const fallbackImage = "https://placehold.co/600x400/f1f5f9/475569?text=MealMart";
const products = [];
let cart = [];
let currentFilter = "all";
let currentSubCategory = "All";
let currentSearch = "";
let checkoutInProgress = false;
let currentUser = null;
let isAdmin = false;
let storedCart = [];
let productsLoaded = false;
let authReady = false;
let queuedProductId = null;

const productGrid = document.getElementById("product-grid");
const catalogStatus = document.getElementById("catalog-status");

function formatNaira(amount) {
    return `₦${new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 }).format(amount)}`;
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;"
    })[character]);
}

function safeImageUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === "https:" && !url.username && !url.password ? url.href : fallbackImage;
    } catch {
        return fallbackImage;
    }
}

function showToast(message, type = "success") {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = "bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-xl text-xs font-bold flex items-center gap-3 pointer-events-auto border border-slate-800";
    const icon = document.createElement("i");
    icon.className = type === "error"
        ? "fa-solid fa-circle-exclamation text-red-400 text-base"
        : "fa-solid fa-circle-check text-brand-500 text-base";
    const text = document.createElement("span");
    text.textContent = message;
    toast.append(icon, text);
    container.append(toast);
    window.setTimeout(() => toast.remove(), 3500);
}

function readSavedCart() {
    try {
        const saved = JSON.parse(localStorage.getItem("mealmart-cart") || "[]");
        if (!Array.isArray(saved)) {
            throw new Error("Saved cart is not a list.");
        }
        return saved.filter((item) =>
            item &&
            typeof item.id === "string" &&
            Number.isInteger(item.quantity) &&
            item.quantity > 0 &&
            item.quantity <= 25
        );
    } catch (error) {
        console.error("Could not restore the saved cart:", error);
        showToast("Your previous cart could not be restored. Start a new cart.", "error");
        return [];
    }
}

function saveCart() {
    try {
        localStorage.setItem("mealmart-cart", JSON.stringify(
            cart.map(({ id, quantity }) => ({ id, quantity }))
        ));
    } catch (error) {
        console.error("Could not save your cart:", error);
        showToast("The cart could not be saved in this browser.", "error");
    }
}

function renderCategoryPills() {
    const container = document.getElementById("category-pills");
    const categories = ["All", ...new Set(products
        .filter((product) => currentFilter === "all" || product.category === currentFilter)
        .map((product) => product.subCategory)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)))];
    container.replaceChildren();

    for (const category of categories) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = category;
        button.className = `px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition ${
            currentSubCategory === category
                ? "bg-slate-900 text-white shadow"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
        }`;
        button.addEventListener("click", () => filterSubCategory(category));
        container.append(button);
    }
}

function filteredProducts() {
    return products.filter((product) => {
        const matchesCategory = currentFilter === "all" || product.category === currentFilter;
        const matchesSubCategory = currentSubCategory === "All" || product.subCategory === currentSubCategory;
        const searchableText = `${product.name} ${product.description} ${product.subCategory}`.toLocaleLowerCase();
        return matchesCategory && matchesSubCategory && searchableText.includes(currentSearch);
    });
}

function renderProducts() {
    renderCategoryPills();
    const matches = filteredProducts();
    document.getElementById("empty-state").classList.toggle("hidden", matches.length > 0);

    if (matches.length === 0) {
        productGrid.replaceChildren();
        return;
    }

    productGrid.innerHTML = matches.map((product) => {
        const productId = escapeHtml(product.id);
        const categoryLabel = product.category === "cooked" ? "Cooked" : "Groceries";
        const categoryColor = product.category === "cooked" ? "bg-orange-500" : "bg-brand-600";
        const badge = product.badge
            ? `<span class="absolute top-3 left-3 px-2.5 py-1 bg-slate-900/80 backdrop-blur text-white text-[10px] font-bold uppercase tracking-wider rounded-lg shadow">${escapeHtml(product.badge)}</span>`
            : "";
        const rating = Number.isFinite(product.rating) && product.rating > 0 ? product.rating.toFixed(1) : "New";
        const reviews = Number.isInteger(product.reviews) && product.reviews >= 0 ? product.reviews : 0;

        return `
            <article class="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col overflow-hidden group">
                <div class="relative h-48 overflow-hidden bg-slate-100">
                    <img src="${escapeHtml(safeImageUrl(product.image))}" alt="${escapeHtml(product.name)}" loading="lazy"
                        onerror="this.onerror=null;this.src='${fallbackImage}'"
                        class="w-full h-full object-cover group-hover:scale-105 transition duration-500">
                    ${badge}
                    <span class="absolute top-3 right-3 px-2.5 py-1 ${categoryColor} text-white text-[10px] font-bold uppercase tracking-wider rounded-lg shadow">
                        ${categoryLabel}
                    </span>
                </div>
                <div class="p-5 flex-1 flex flex-col">
                    <div class="flex items-center justify-between text-xs text-slate-400 mb-1.5 font-medium">
                        <span>${escapeHtml(product.subCategory)}</span>
                        <span class="flex items-center gap-1 text-amber-500 font-bold">
                            <i class="fa-solid fa-star text-[11px]"></i>${rating}
                            <span class="text-slate-300 font-normal">(${reviews})</span>
                        </span>
                    </div>
                    <h3 class="font-bold text-slate-900 text-base mb-1 line-clamp-1 group-hover:text-brand-600 transition">${escapeHtml(product.name)}</h3>
                    <p class="text-xs text-slate-500 line-clamp-2 mb-4 flex-1">${escapeHtml(product.description)}</p>
                    <div class="flex items-center justify-between pt-3 border-t border-slate-100 mt-auto">
                        <div>
                            <span class="text-[10px] uppercase font-semibold text-slate-400 block">Price</span>
                            <span class="text-lg font-black text-slate-900">${formatNaira(product.price)}</span>
                        </div>
                        <button type="button" data-add-product="${productId}" class="px-4 py-2.5 bg-brand-50 hover:bg-brand-600 text-brand-600 hover:text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 shadow-sm">
                            <i class="fa-solid fa-plus"></i> Add
                        </button>
                    </div>
                </div>
            </article>
        `;
    }).join("");
}

function syncCartProducts() {
    cart = storedCart
        .map((item) => {
            const product = products.find((candidate) => candidate.id === item.id);
            return product ? { ...product, quantity: item.quantity } : null;
        })
        .filter(Boolean);
    storedCart = [];
    saveCart();
}

function updateCartUI() {
    const badge = document.getElementById("cart-badge");
    const countLabel = document.getElementById("cart-item-count-label");
    const itemsContainer = document.getElementById("cart-items-container");
    const emptyState = document.getElementById("cart-empty");
    const footer = document.getElementById("cart-footer");
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const delivery = subtotal === 0 || subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE;

    badge.textContent = String(count);
    countLabel.textContent = `${count} item${count === 1 ? "" : "s"} selected`;
    emptyState.classList.toggle("hidden", cart.length > 0);
    itemsContainer.classList.toggle("hidden", cart.length === 0);
    footer.classList.toggle("hidden", cart.length === 0);

    if (cart.length === 0) {
        itemsContainer.replaceChildren();
        return;
    }

    itemsContainer.innerHTML = cart.map((item) => `
        <article class="flex items-center gap-4 py-3">
            <img src="${escapeHtml(safeImageUrl(item.image))}" alt="" class="w-16 h-16 object-cover rounded-xl shrink-0 border border-slate-100">
            <div class="flex-1 min-w-0">
                <h4 class="font-bold text-sm text-slate-900 truncate">${escapeHtml(item.name)}</h4>
                <p class="text-xs text-brand-600 font-bold mt-0.5">${formatNaira(item.price)}</p>
                <div class="flex items-center gap-3 mt-2">
                    <button type="button" data-cart-id="${escapeHtml(item.id)}" data-cart-delta="-1" aria-label="Remove one ${escapeHtml(item.name)}" class="w-6 h-6 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold text-slate-700">−</button>
                    <span class="text-xs font-bold text-slate-800">${item.quantity}</span>
                    <button type="button" data-cart-id="${escapeHtml(item.id)}" data-cart-delta="1" aria-label="Add one ${escapeHtml(item.name)}" class="w-6 h-6 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold text-slate-700">+</button>
                </div>
            </div>
            <strong class="text-sm text-slate-900">${formatNaira(item.price * item.quantity)}</strong>
        </article>
    `).join("");

    document.getElementById("cart-subtotal").textContent = formatNaira(subtotal);
    document.getElementById("cart-delivery").textContent = delivery === 0 ? "Free" : formatNaira(delivery);
    document.getElementById("cart-total").textContent = formatNaira(subtotal + delivery);
}

function addToCart(productId) {
    if (!authReady) {
        queuedProductId = productId;
        return;
    }

    if (!currentUser) {
        const params = new URLSearchParams({ next: "cart", product: productId });
        window.location.href = `signup.html?${params}`;
        return;
    }

    const product = products.find((item) => item.id === productId);
    if (!product) {
        showToast("That product is no longer available.", "error");
        return;
    }

    const existing = cart.find((item) => item.id === productId);
    if (existing) {
        if (existing.quantity >= 25) {
            showToast("You can add up to 25 of each product.", "error");
            return;
        }
        existing.quantity += 1;
    } else {
        cart.push({ ...product, quantity: 1 });
    }

    saveCart();
    updateCartUI();
    showToast(`${product.name} added to your cart.`);
}

function updateQuantity(productId, delta) {
    const item = cart.find((entry) => entry.id === productId);
    if (!item) {
        return;
    }
    if (delta > 0 && item.quantity >= 25) {
        showToast("You can add up to 25 of each product.", "error");
        return;
    }

    item.quantity += delta;
    if (item.quantity <= 0) {
        cart = cart.filter((entry) => entry.id !== productId);
    }
    saveCart();
    updateCartUI();
}

function toggleCart() {
    document.getElementById("cart-drawer").classList.toggle("hidden");
}

function filterCatalog(type) {
    currentFilter = ["all", "cooked", "grocery"].includes(type) ? type : "all";
    currentSubCategory = "All";
    document.querySelectorAll(".tab-btn").forEach((button) => {
        button.className = "tab-btn px-6 py-2.5 rounded-xl font-bold text-sm transition text-slate-600 hover:text-slate-900";
    });
    const activeTab = document.getElementById(`tab-${currentFilter}`);
    if (activeTab) {
        activeTab.className = "tab-btn px-6 py-2.5 rounded-xl font-bold text-sm transition bg-white text-slate-900 shadow-sm";
    }
    renderProducts();
}

function filterSubCategory(category) {
    currentSubCategory = category;
    renderProducts();
}

function openCheckoutModal() {
    if (cart.length === 0 || checkoutInProgress) {
        return;
    }
    if (!currentUser) {
        window.location.href = "login.html?next=checkout";
        return;
    }

    toggleCart();
    document.getElementById("checkout-error").textContent = "";
    document.getElementById("checkout-modal").classList.remove("hidden");
    document.getElementById("cust-name").value = currentUser.displayName || "";
}

function closeCheckoutModal() {
    document.getElementById("checkout-modal").classList.add("hidden");
}

async function processOrder(event) {
    event.preventDefault();
    const checkoutForm = event.currentTarget;
    if (!currentUser) {
        window.location.href = "login.html?next=checkout";
        return;
    }
    if (cart.length === 0 || checkoutInProgress) {
        return;
    }

    checkoutInProgress = true;
    const submitButton = checkoutForm.querySelector('button[type="submit"]');
    const errorElement = document.getElementById("checkout-error");
    submitButton.disabled = true;
    submitButton.textContent = "Placing your order…";
    errorElement.textContent = "";

    try {
        const placeOrder = httpsCallable(functions, "placeOrder");
        const response = await placeOrder({
            items: cart.map((item) => ({ productId: item.id, quantity: item.quantity })),
            delivery: {
                name: document.getElementById("cust-name").value.trim(),
                phone: document.getElementById("cust-phone").value.trim(),
                city: document.getElementById("cust-city").value,
                address: document.getElementById("cust-address").value.trim()
            }
        });

        const { orderId, total } = response.data;
        cart = [];
        saveCart();
        updateCartUI();
        checkoutForm.reset();
        closeCheckoutModal();
        document.getElementById("order-summary").textContent =
            `Order ${orderId} was received. Your total is ${formatNaira(total)}. Pay cash on delivery.`;
        document.getElementById("success-modal").classList.remove("hidden");
    } catch (error) {
        console.error("Checkout failed:", error);
        errorElement.textContent = error.message || "We couldn't place the order. Please try again.";
        showToast(errorElement.textContent, "error");
    } finally {
        checkoutInProgress = false;
        submitButton.disabled = false;
        submitButton.innerHTML = 'Place Order Now <i class="fa-solid fa-check"></i>';
    }
}

function closeSuccessModal() {
    document.getElementById("success-modal").classList.add("hidden");
}

function toggleMobileMenu() {
    const links = document.getElementById("account-links");
    if (currentUser) {
        showToast("You are signed in to MEALMART.");
        return;
    }
    links.classList.toggle("hidden");
    links.classList.toggle("flex");
}

function handleNewsletter(event) {
    event.preventDefault();
    showToast("Newsletter signup is not enabled yet.", "error");
}

function setupEventListeners() {
    const searchInputs = [
        document.getElementById("search-input"),
        document.getElementById("mobile-search-input")
    ];
    for (const input of searchInputs) {
        input.addEventListener("input", (event) => {
            const value = event.target.value.toLocaleLowerCase().trim();
            currentSearch = value;
            for (const otherInput of searchInputs) {
                if (otherInput !== event.target) {
                    otherInput.value = event.target.value;
                }
            }
            renderProducts();
        });
    }

    productGrid.addEventListener("click", (event) => {
        const button = event.target.closest("[data-add-product]");
        if (button) {
            addToCart(button.dataset.addProduct);
        }
    });

    document.getElementById("cart-items-container").addEventListener("click", (event) => {
        const button = event.target.closest("[data-cart-id]");
        if (button) {
            updateQuantity(button.dataset.cartId, Number(button.dataset.cartDelta));
        }
    });

    document.getElementById("checkout-form").addEventListener("submit", processOrder);
    document.getElementById("sign-out-button").addEventListener("click", async () => {
        try {
            await signOut(auth);
            showToast("You have signed out.");
        } catch (error) {
            console.error("Sign out failed:", error);
            showToast("Could not sign out. Please try again.", "error");
        }
    });
}

async function loadProducts() {
    catalogStatus.textContent = "Loading products…";
    try {
        const snapshot = await getDocs(query(collection(db, "products"), where("active", "==", true)));
        products.splice(0, products.length);
        for (const productSnapshot of snapshot.docs) {
            const data = productSnapshot.data();
            if (
                typeof data.name !== "string" ||
                typeof data.description !== "string" ||
                !Number.isSafeInteger(data.price) ||
                data.price < 1 ||
                !["cooked", "grocery"].includes(data.category) ||
                typeof data.subCategory !== "string" ||
                typeof data.image !== "string"
            ) {
                console.warn("Skipping invalid product document:", productSnapshot.id);
                continue;
            }
            products.push({ id: productSnapshot.id, ...data });
        }

        products.sort((a, b) => a.name.localeCompare(b.name));
        productsLoaded = true;
        syncCartProducts();
        catalogStatus.textContent = products.length
            ? `${products.length} fresh products available · Prices in Nigerian naira`
            : "No products are available yet. Check back soon.";
        renderProducts();
        updateCartUI();
        maybeResumeCheckout();
        maybeResumePendingAddToCart();
    } catch (error) {
        console.error("Could not load products from Firebase:", error);
        catalogStatus.textContent = "The menu could not be loaded. Please try again later.";
        showToast("Unable to load the MEALMART menu.", "error");
    }
}

function maybeResumeCheckout() {
    if (
        new URLSearchParams(window.location.search).get("checkout") === "1" &&
        currentUser &&
        cart.length > 0
    ) {
        openCheckoutModal();
        window.history.replaceState({}, "", window.location.pathname);
    }
}

function maybeResumePendingAddToCart() {
    const params = new URLSearchParams(window.location.search);
    const productId = params.get("addToCart");
    if (!productId || !currentUser || !productsLoaded) {
        return;
    }

    addToCart(productId);
    params.delete("addToCart");
    const query = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
}

onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    authReady = true;
    isAdmin = false;
    const accountLinks = document.getElementById("account-links");
    const accountMenu = document.getElementById("account-menu");
    accountLinks.classList.toggle("hidden", Boolean(user));
    accountMenu.classList.toggle("hidden", !user);
    accountMenu.classList.toggle("flex", Boolean(user));
    document.getElementById("account-name").textContent = user?.displayName || user?.email || "";

    if (queuedProductId) {
        const productId = queuedProductId;
        queuedProductId = null;
        addToCart(productId);
    }

    if (user) {
        try {
            const adminSnapshot = await getDoc(doc(db, "admins", user.uid));
            isAdmin = adminSnapshot.exists() && adminSnapshot.data().enabled === true;
        } catch (error) {
            console.error("Could not verify admin access:", error);
            isAdmin = false;
        }
    }
    document.getElementById("admin-link").classList.toggle("hidden", !isAdmin);
    maybeResumeCheckout();
    maybeResumePendingAddToCart();
});

function initialize() {
    storedCart = readSavedCart();
    cart = [];
    updateCartUI();
    setupEventListeners();
    loadProducts();
}

Object.assign(window, {
    addToCart,
    closeCheckoutModal,
    closeSuccessModal,
    filterCatalog,
    filterSubCategory,
    handleNewsletter,
    openCheckoutModal,
    processOrder,
    toggleCart,
    toggleMobileMenu,
    updateQuantity
});

initialize();
