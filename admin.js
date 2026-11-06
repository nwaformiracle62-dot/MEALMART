import { auth, cloudinaryConfig, db } from "./config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    orderBy,
    query,
    serverTimestamp,
    updateDoc
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const accessMessage = document.getElementById("admin-access-message");
const adminContent = document.getElementById("admin-content");
const form = document.getElementById("product-form");
const formStatus = document.getElementById("admin-status");
const listStatus = document.getElementById("product-list-status");
const list = document.getElementById("admin-product-list");
const uploadButton = document.getElementById("upload-button");
const userList = document.getElementById("admin-user-list");
const userListStatus = document.getElementById("user-list-status");
const orderList = document.getElementById("admin-order-list");
const orderListStatus = document.getElementById("order-list-status");
const orderStatuses = [
    ["received", "Received"],
    ["preparing", "Preparing"],
    ["out-for-delivery", "Out for delivery"],
    ["delivered", "Delivered"],
    ["cancelled", "Cancelled"]
];
let activeAdmin = false;

function showStatus(message, isError = false) {
    formStatus.textContent = message;
    formStatus.className = `min-h-5 text-sm ${isError ? "text-red-700" : "text-green-800"}`;
}

function renderProduct(productId, product) {
    const row = document.createElement("article");
    row.className = "flex flex-col gap-3 py-4 sm:flex-row sm:items-center";

    const image = document.createElement("img");
    try {
        const imageUrl = new URL(product.image);
        image.src = imageUrl.protocol === "https:" ? imageUrl.href : "";
    } catch {
        image.src = "";
    }
    image.alt = "";
    image.className = "h-16 w-16 shrink-0 rounded-xl bg-slate-100 object-cover";

    const details = document.createElement("div");
    details.className = "min-w-0 flex-1";
    const name = document.createElement("h3");
    name.className = "truncate text-sm font-bold text-slate-900";
    name.textContent = product.name;
    const description = document.createElement("p");
    description.className = "mt-1 line-clamp-2 text-xs text-slate-500";
    description.textContent = `${product.category === "cooked" ? "Cooked meal" : "Grocery"} · ${product.subCategory} · ₦${new Intl.NumberFormat("en-NG").format(product.price)}`;
    details.append(name, description);

    const actions = document.createElement("div");
    actions.className = "flex shrink-0 items-center gap-2";
    const state = document.createElement("span");
    state.className = `text-xs font-semibold ${product.active ? "text-green-700" : "text-slate-400"}`;
    state.textContent = product.active ? "Live" : "Hidden";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.dataset.productAction = "toggle";
    toggle.dataset.productId = productId;
    toggle.dataset.active = String(product.active);
    toggle.textContent = product.active ? "Hide" : "Publish";
    toggle.className = "rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold hover:bg-slate-50";

    const remove = document.createElement("button");
    remove.type = "button";
    remove.dataset.productAction = "delete";
    remove.dataset.productId = productId;
    remove.textContent = "Delete";
    remove.className = "rounded-lg border border-red-100 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50";

    actions.append(state, toggle, remove);
    row.append(image, details, actions);
    return row;
}

async function loadAdminProducts() {
    listStatus.textContent = "Loading products…";
    list.replaceChildren();
    try {
        const snapshot = await getDocs(collection(db, "products"));
        if (snapshot.empty) {
            listStatus.textContent = "No products yet. Upload your first product.";
            return;
        }

        const records = snapshot.docs
            .map((item) => ({ id: item.id, product: item.data() }))
            .filter(({ product }) =>
                typeof product.name === "string" &&
                Number.isSafeInteger(product.price) &&
                typeof product.image === "string"
            )
            .sort((a, b) => a.product.name.localeCompare(b.product.name));
        for (const record of records) {
            list.append(renderProduct(record.id, record.product));
        }
        listStatus.textContent = `${records.length} product${records.length === 1 ? "" : "s"}`;
    } catch (error) {
        console.error("Could not load admin products:", error);
        listStatus.textContent = "Could not load products. Check your connection and admin access.";
    }
}

function formatDate(timestamp) {
    const date = timestamp?.toDate?.();
    return date instanceof Date && !Number.isNaN(date.getTime())
        ? new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(date)
        : "Not available";
}

async function loadAdminUsers() {
    userListStatus.textContent = "Loading customer accounts…";
    userList.replaceChildren();
    try {
        const snapshot = await getDocs(collection(db, "users"));
        const users = snapshot.docs
            .map((item) => ({ id: item.id, user: item.data() }))
            .sort((a, b) => (b.user.createdAt?.toMillis?.() || 0) - (a.user.createdAt?.toMillis?.() || 0));

        if (users.length === 0) {
            userListStatus.textContent = "No customer accounts have been registered yet.";
            return;
        }

        for (const { id, user } of users) {
            const row = document.createElement("article");
            row.className = "flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between";
            const identity = document.createElement("div");
            identity.className = "min-w-0";
            const name = document.createElement("h3");
            name.className = "truncate text-sm font-bold text-slate-900";
            name.textContent = user.displayName || "Unnamed customer";
            const email = document.createElement("p");
            email.className = "mt-1 truncate text-sm text-slate-600";
            email.textContent = user.email || "No email available";
            const contact = document.createElement("p");
            contact.className = "mt-1 text-xs text-slate-500";
            contact.textContent = `Phone: ${user.phone || "Not provided"} · Account: ${id}`;
            identity.append(name, email, contact);
            const created = document.createElement("p");
            created.className = "shrink-0 text-xs text-slate-500";
            created.textContent = `Joined ${formatDate(user.createdAt)}`;
            row.append(identity, created);
            userList.append(row);
        }
        userListStatus.textContent = `${users.length} customer account${users.length === 1 ? "" : "s"}`;
    } catch (error) {
        console.error("Could not load customer accounts:", error);
        if (error.code === "permission-denied") {
            userListStatus.textContent = "Firestore is blocking access to customer accounts. Run `firebase deploy --only firestore:rules --project eliana-fb7da`, then refresh.";
        } else if (error.code === "unauthenticated") {
            userListStatus.textContent = "Your admin session has expired. Sign in again, then refresh.";
        } else {
            userListStatus.textContent = "Could not load customer accounts. Check your connection and try again.";
        }
    }
}

function renderAdminOrder(orderId, order) {
    const row = document.createElement("article");
    row.className = "space-y-3 py-5";

    const heading = document.createElement("div");
    heading.className = "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between";
    const summary = document.createElement("div");
    const title = document.createElement("h3");
    title.className = "text-sm font-bold text-slate-900";
    title.textContent = `Order ${orderId}`;
    const date = document.createElement("p");
    date.className = "mt-1 text-xs text-slate-500";
    date.textContent = formatDate(order.createdAt);
    summary.append(title, date);

    const controls = document.createElement("div");
    controls.className = "flex items-center gap-3";
    const total = document.createElement("strong");
    total.className = "text-sm text-slate-900";
    total.textContent = Number.isSafeInteger(order.total)
        ? `₦${new Intl.NumberFormat("en-NG").format(order.total)}`
        : "Total unavailable";
    const status = document.createElement("select");
    status.dataset.orderStatus = "";
    status.dataset.orderId = orderId;
    status.setAttribute("aria-label", `Change status for order ${orderId}`);
    status.className = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700";
    for (const [value, label] of orderStatuses) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        status.append(option);
    }
    status.value = orderStatuses.some(([value]) => value === order.status) ? order.status : "received";
    status.dataset.previousStatus = status.value;
    controls.append(total, status);
    heading.append(summary, controls);

    const customer = order.customer && typeof order.customer === "object" ? order.customer : {};
    const delivery = document.createElement("p");
    delivery.className = "text-sm text-slate-600";
    delivery.textContent = `${customer.name || "Customer"} · ${customer.phone || "No phone"} · ${customer.city || "No city"} · ${customer.address || "No address"}`;

    const items = document.createElement("p");
    items.className = "text-xs text-slate-500";
    items.textContent = Array.isArray(order.items)
        ? order.items.map((item) => `${item.name || "Item"} × ${item.quantity || 0}`).join(", ")
        : "Order items unavailable";

    row.append(heading, delivery, items);
    return row;
}

async function loadAdminOrders() {
    orderListStatus.textContent = "Loading food orders…";
    orderList.replaceChildren();
    try {
        const snapshot = await getDocs(query(collection(db, "orders"), orderBy("createdAt", "desc")));
        if (snapshot.empty) {
            orderListStatus.textContent = "No food orders have been placed yet.";
            return;
        }

        for (const orderSnapshot of snapshot.docs) {
            orderList.append(renderAdminOrder(orderSnapshot.id, orderSnapshot.data()));
        }
        orderListStatus.textContent = `${snapshot.size} food order${snapshot.size === 1 ? "" : "s"}`;
    } catch (error) {
        console.error("Could not load food orders:", error);
        orderListStatus.textContent = "Could not load food orders. Check your connection and admin access.";
    }
}

async function uploadProduct(event) {
    event.preventDefault();
    if (!activeAdmin) {
        showStatus("Administrator access is required.", true);
        return;
    }

    const values = new FormData(form);
    const name = String(values.get("name") || "").trim();
    const description = String(values.get("description") || "").trim();
    const price = Number(values.get("price"));
    const category = String(values.get("category") || "");
    const subCategory = String(values.get("subCategory") || "").trim();
    const badge = String(values.get("badge") || "").trim();
    const imageFile = values.get("image");

    if (
        name.length < 2 || name.length > 100 ||
        description.length < 5 || description.length > 500 ||
        !Number.isSafeInteger(price) || price < 1 || price > 100000000 ||
        !["cooked", "grocery"].includes(category) ||
        subCategory.length < 2 || subCategory.length > 40 ||
        badge.length > 30 ||
        !(imageFile instanceof File) || imageFile.size < 1 || imageFile.size > 5 * 1024 * 1024 ||
        !["image/jpeg", "image/png", "image/webp"].includes(imageFile.type)
    ) {
        showStatus("Check the product details and choose a JPG, PNG or WebP image up to 5 MB.", true);
        return;
    }

    uploadButton.disabled = true;
    uploadButton.textContent = "Uploading…";
    showStatus("Uploading product photo…");

    try {
        const uploadData = new FormData();
        uploadData.append("file", imageFile);
        uploadData.append("upload_preset", cloudinaryConfig.uploadPreset);
        const uploadResponse = await fetch(
            `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudinaryConfig.cloudName)}/image/upload`,
            { method: "POST", body: uploadData }
        );
        const uploadResult = await uploadResponse.json();
        if (!uploadResponse.ok) {
            throw new Error(uploadResult.error?.message || "Cloudinary image upload failed.");
        }

        const imageUrl = new URL(uploadResult.secure_url);
        if (imageUrl.protocol !== "https:" || imageUrl.hostname !== "res.cloudinary.com") {
            throw new Error("Cloudinary returned an invalid image URL.");
        }

        await addDoc(collection(db, "products"), {
            name,
            description,
            price,
            category,
            subCategory,
            badge,
            image: imageUrl.href,
            active: true,
            rating: 0,
            reviews: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });

        form.reset();
        showStatus("Product uploaded and published.");
        await loadAdminProducts();
    } catch (error) {
        console.error("Product upload failed:", error);
        showStatus(error.message || "Product upload failed. Please try again.", true);
    } finally {
        uploadButton.disabled = false;
        uploadButton.textContent = "Upload product";
    }
}

list.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-product-action]");
    if (!button || !activeAdmin) {
        return;
    }
    button.disabled = true;
    const productRef = doc(db, "products", button.dataset.productId);
    try {
        if (button.dataset.productAction === "toggle") {
            await updateDoc(productRef, {
                active: button.dataset.active !== "true",
                updatedAt: serverTimestamp()
            });
        } else if (button.dataset.productAction === "delete") {
            await deleteDoc(productRef);
        }
        await loadAdminProducts();
    } catch (error) {
        console.error("Could not update product:", error);
        listStatus.textContent = error.message || "Could not update product.";
        button.disabled = false;
    }
});

document.querySelector('[role="tablist"]').addEventListener("click", async (event) => {
    const selectedTab = event.target.closest("button[data-admin-tab]");
    if (!selectedTab) {
        return;
    }

    for (const tab of document.querySelectorAll("button[data-admin-tab]")) {
        const selected = tab === selectedTab;
        tab.setAttribute("aria-selected", String(selected));
        tab.className = selected
            ? "rounded-xl bg-green-700 px-4 py-2.5 text-sm font-bold text-white"
            : "rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100";
    }
    for (const panel of document.querySelectorAll("[data-admin-panel]")) {
        panel.classList.toggle("hidden", panel.dataset.adminPanel !== selectedTab.dataset.adminTab);
    }

    if (selectedTab.dataset.adminTab === "users") {
        await loadAdminUsers();
    } else if (selectedTab.dataset.adminTab === "orders") {
        await loadAdminOrders();
    }
});

orderList.addEventListener("change", async (event) => {
    const select = event.target.closest("select[data-order-status]");
    if (!select || !activeAdmin) {
        return;
    }

    const previousStatus = select.dataset.previousStatus;
    select.disabled = true;
    orderListStatus.textContent = "Updating order status…";
    try {
        await updateDoc(doc(db, "orders", select.dataset.orderId), {
            status: select.value,
            updatedAt: serverTimestamp()
        });
        select.dataset.previousStatus = select.value;
        orderListStatus.textContent = "Order status updated.";
    } catch (error) {
        console.error("Could not update order status:", error);
        select.value = previousStatus;
        orderListStatus.textContent = error.message || "Could not update order status.";
    } finally {
        select.disabled = false;
    }
});

form.addEventListener("submit", uploadProduct);
document.getElementById("refresh-products").addEventListener("click", loadAdminProducts);
document.getElementById("refresh-users").addEventListener("click", loadAdminUsers);
document.getElementById("refresh-orders").addEventListener("click", loadAdminOrders);
document.getElementById("admin-sign-out").addEventListener("click", async () => {
    try {
        await signOut(auth);
        window.location.replace("index.html");
    } catch (error) {
        console.error("Admin sign out failed:", error);
        accessMessage.textContent = "Could not sign out. Please try again.";
    }
});

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.replace("login.html?next=admin");
        return;
    }

    document.getElementById("admin-identity").textContent = user.displayName || user.email || "";
    try {
        const adminSnapshot = await getDoc(doc(db, "admins", user.uid));
        activeAdmin = adminSnapshot.exists() && adminSnapshot.data().enabled === true;
    } catch (error) {
        console.error("Could not verify admin role:", error);
        activeAdmin = false;
        accessMessage.textContent = "Unable to verify administrator access. Check Firebase setup and retry.";
        return;
    }

    if (!activeAdmin) {
        accessMessage.textContent = "This account does not have administrator access. Ask the Firebase project owner to grant the admin role.";
        return;
    }

    accessMessage.classList.add("hidden");
    adminContent.classList.remove("hidden");
    await loadAdminProducts();
});
