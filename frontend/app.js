const appEl = document.getElementById("app");
const flashEl = document.getElementById("flash");
const navHomeEl = document.getElementById("nav-home");
const navActionsEl = document.getElementById("nav-actions");
const navAuthEl = document.getElementById("go-auth");
const navProfileEl = document.getElementById("go-profile");
const navCheckoutEl = document.getElementById("go-checkout");
const navTrackingEl = document.getElementById("go-tracking");

const CART_KEY = "food_delivery_cart";
const AUTH_SESSION_KEY = "fastbite_demo_session";
const MANAGER_SESSION_KEY = "fastbite_manager_session";
const DEFAULT_MANAGER_USER = {
  name: "FastBite Manager",
  email: "manager@fastbite.vn",
  phone: "0901234567",
  password: "Manager@123",
};
const VALID_CATEGORIES = [
  "Burger",
  "Pizza",
  "Fried Chicken",
  "Combo Meal",
  "Khác",
];
const MANAGER_STATUS_FLOW = ["PENDING", "CONFIRMED", "PREPARING", "DELIVERING", "DELIVERED", "CANCELLED"];
const MANAGER_STATUS_CONFIG = {
  PENDING: { label: "Đơn mới", className: "pending" },
  CONFIRMED: { label: "Đã xác nhận", className: "confirmed" },
  PREPARING: { label: "Đang chế biến", className: "preparing" },
  DELIVERING: { label: "Đang giao", className: "delivering" },
  DELIVERED: { label: "Hoàn thành", className: "delivered" },
  CANCELLED: { label: "Đã hủy", className: "cancelled" },
};
const MANAGER_VALID_TRANSITIONS = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["DELIVERING"],
  DELIVERING: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};
const HOME_CATEGORY_TABS = [
  "Tất Cả",
  "Burger",
  "Pizza",
  "Fried Chicken",
  "Combo Meal",
  "Khác",
];

const CATEGORY_ADDONS = {
  "Burger": [
    { name: "Thêm Sốt Cay Nhẹ", price: 5000 },
    { name: "Thêm Phô Mai Cắt Lát", price: 10000 },
    { name: "Thêm Salad Trộn", price: 8000 }
  ],
  "Pizza": [
    { name: "Thêm Viền Phô Mai Chảy", price: 25000 },
    { name: "Thêm Pepperoni Xúc Xích", price: 15000 },
    { name: "Thêm Phô Mai Mozzarella", price: 10000 }
  ],
  "Fried Chicken": [
    { name: "Thêm Sốt Mật Ong", price: 5000 },
    { name: "Thêm Khoai Tây Chiên", price: 15000 },
    { name: "Bỏ Xương (Boneless)", price: 0 }
  ],
  "Combo Meal": [
    { name: "Nâng Cỡ Nước Lớn", price: 5000 },
    { name: "Thêm Món Phụ", price: 20000 },
    { name: "Đổi Nước Ngọt → Trà Đào", price: 8000 }
  ],
  "Khác": [
    { name: "Thêm Trứng Ốp La", price: 8000 },
    { name: "Thêm Rau Củ", price: 5000 },
    { name: "Cơm Thêm", price: 10000 }
  ]
};

// Item-specific addons override for "Khác" category
const ITEM_SPECIFIC_ADDONS = {
  "French Fries": [
    { name: "Thêm Khoai", price: 10000 },
    { name: "Thêm Sốt Phô Mai", price: 5000 },
    { name: "Rắc Bột Rong Biển", price: 3000 }
  ],
  "Choco Milkshake": [
    { name: "Không Đá", price: 0 },
    { name: "50% Đường", price: 0 },
    { name: "100% Đường", price: 0 }
  ],
  "Mozzarella Sticks": [
    { name: "Thêm Sốt Marinara", price: 5000 },
    { name: "Thêm Sốt Ranch", price: 5000 },
    { name: "Thêm Phần", price: 15000 }
  ]
  // Fried Rice Special: uses default "Khác" addons
};

/* ---------- helpers ---------- */
let _allMenuItemsCache = [];

function formatVND(amount) {
  return Number(amount).toLocaleString("vi-VN") + "₫";
}

function detectMenuCategory(menuItemName) {
  const name = menuItemName.toLowerCase();
  if (name.includes("fried rice") || name.includes("rice") || name.includes("cơm")) return "Khác";
  if (name.includes("burger")) return "Burger";
  if (name.includes("pizza")) return "Pizza";
  if (name.includes("chicken") || name.includes("gà") || name.includes("fried")) return "Fried Chicken";
  if (name.includes("combo") || name.includes("set")) return "Combo Meal";
  return "Khác";
}

function normalizeCategory(rawCategory, itemName) {
  if (VALID_CATEGORIES.includes(rawCategory)) return rawCategory;
  return detectMenuCategory(itemName || "");
}

async function loadRestaurantMenuCatalog() {
  const rawRestaurants = await api("/api/restaurants");
  const restaurants = Array.isArray(rawRestaurants)
    ? rawRestaurants.filter((restaurant) => String(restaurant.name || "").toLowerCase() !== "demo restaurant")
    : [];

  const menuGroups = await Promise.all(
    restaurants.map(async (restaurant) => {
      try {
        const menuItems = await api(`/api/restaurants/${restaurant.id}/menu`);
        return menuItems.map((item) => ({
          ...item,
          restaurant_name: restaurant.name,
          restaurant_id: restaurant.id,
          category_label: normalizeCategory(item.category, item.name),
          image_url: item.image_url || `https://loremflickr.com/320/240/${encodeURIComponent(item.name)},fastfood`,
          source: "api",
        }));
      } catch {
        return [];
      }
    }),
  );

  return {
    restaurants,
    menuItems: menuGroups.flat(),
  };
}

function getCart() { return JSON.parse(localStorage.getItem(CART_KEY) || "[]"); }
function setCart(cart) { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }

function showFlash(type, message) {
  flashEl.className = `flash ${type}`;
  flashEl.textContent = message;
  setTimeout(() => clearFlash(), 3000);
}
function clearFlash() { flashEl.className = "flash hidden"; flashEl.textContent = ""; }
function showLoading() { appEl.innerHTML = '<div class="spinner"></div>'; }

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    let detail = "Request failed";
    try {
      const body = await response.json();
      if (typeof body.detail === 'string') {
        detail = body.detail;
      } else if (Array.isArray(body.detail)) {
        detail = body.detail.map(e => `${e.loc.join('.')}: ${e.msg}`).join(' | ');
      } else if (body.detail) {
        detail = JSON.stringify(body.detail);
      } else {
        detail = JSON.stringify(body);
      }
    } catch { detail = await response.text(); }
    throw new Error(detail);
  }
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return response.json();
  return null;
}

function routeTo(path) { window.location.hash = path; }

function parseRoute() {
  const hash = window.location.hash || "#/auth";
  if (hash === "#/auth") return { page: "auth" };
  if (hash === "#/profile") return { page: "profile" };
  if (hash === "#/manager-auth") return { page: "manager-auth" };
  if (hash === "#/manager") return { page: "manager" };
  if (hash === "#/cart") return { page: "cart" };
  if (hash === "#/checkout") return { page: "checkout" };
  if (hash === "#/tracking") return { page: "tracking" };
  return { page: "home" };
}

function normalizeIdentity(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidPhone(phone) {
  return /^\d{10}$/.test(String(phone || "").trim());
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function isValidLoginIdentity(identity) {
  const normalizedIdentity = String(identity || "").trim();
  return isValidPhone(normalizedIdentity) || isValidEmail(normalizedIdentity);
}

function getManagerStatusLabel(status) {
  return MANAGER_STATUS_CONFIG[status]?.label || "Không xác định";
}

function getManagerStatusClass(status) {
  return MANAGER_STATUS_CONFIG[status]?.className || "pending";
}

function getManagerStatusOptions(currentStatus) {
  const allowedTransitions = MANAGER_VALID_TRANSITIONS[currentStatus] || [];
  return [currentStatus, ...allowedTransitions]
    .filter((status, index, list) => MANAGER_STATUS_FLOW.includes(status) && list.indexOf(status) === index);
}

async function getUsers(role = null) {
  const query = role ? `?role=${encodeURIComponent(role)}` : "";
  const users = await api(`/api/users${query}`);
  return Array.isArray(users) ? users : [];
}

async function getUserById(userId) {
  return api(`/api/users/${encodeURIComponent(userId)}`);
}

async function loginUser(identity, password) {
  return api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ identity, password }),
  });
}

async function registerCustomer(payload) {
  return api("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ ...payload, role: "customer" }),
  });
}

function hasAuthSession() {
  return Boolean(localStorage.getItem(AUTH_SESSION_KEY));
}

async function getCurrentCustomer() {
  const currentUserId = localStorage.getItem(AUTH_SESSION_KEY);
  if (!currentUserId) return null;
  try {
    return await getUserById(currentUserId);
  } catch {
    return null;
  }
}

function setAuthSession(userId) {
  if (userId) {
    localStorage.setItem(AUTH_SESSION_KEY, String(userId));
    return;
  }
  localStorage.removeItem(AUTH_SESSION_KEY);
}

function hasManagerSession() {
  return Boolean(localStorage.getItem(MANAGER_SESSION_KEY));
}

function setManagerSession(userId) {
  if (userId) {
    localStorage.setItem(MANAGER_SESSION_KEY, String(userId));
    return;
  }
  localStorage.removeItem(MANAGER_SESSION_KEY);
}

function updateChrome(page) {
  const isAuthPage = page === "auth" || page === "manager-auth";
  const isManagerPage = page === "manager";
  document.body.classList.toggle("page-auth", isAuthPage);
  document.body.classList.toggle("page-manager", isManagerPage);
  navActionsEl.classList.toggle("hidden", isAuthPage);
  navAuthEl.textContent = hasAuthSession() ? "Đăng Xuất" : "Đăng Nhập";
}

function ensureInitialRoute() {
  if (!window.location.hash) {
    routeTo(hasAuthSession() ? "#/" : "#/auth");
    return true;
  }
  return false;
}

function addToCart(menuItem) {
  const cart = getCart();
  const found = cart.find((item) => item.id === menuItem.id);
  if (found) { found.quantity += 1; }
  else {
    cart.push({
      id: menuItem.id,
      name: menuItem.name,
      unit_price: menuItem.price,
      image_url: menuItem.image_url || "",
      restaurant_id: menuItem.restaurant_id,
      quantity: 1,
    });
  }
  setCart(cart);
  showFlash("success", "Đã thêm vào giỏ hàng ✓");
}

function findMenuItemById(id) {
  return _allMenuItemsCache.find(item => item.id === id) || null;
}

function getAddonsForItem(menuItem) {
  // Check item-specific addons first
  if (ITEM_SPECIFIC_ADDONS[menuItem.name]) {
    return { label: menuItem.name, addons: ITEM_SPECIFIC_ADDONS[menuItem.name] };
  }
  // Fall back to category addons
  const category = menuItem.category_label || "Khác";
  const addons = CATEGORY_ADDONS[category] || CATEGORY_ADDONS["Khác"];
  return { label: category, addons };
}

/* ---------- PRODUCT DETAIL MODAL ---------- */
function openProductModal(menuItem) {
  closeProductModal();
  const { label: addonLabel, addons } = getAddonsForItem(menuItem);
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "product-modal-overlay";
  overlay.innerHTML = `
    <div class="modal-box">
      <button class="modal-close" id="modal-close-btn">✕</button>
      <div class="modal-content">
        <div class="modal-image-col">
          <img src="${menuItem.image_url}" alt="${menuItem.name}" class="modal-image" />
        </div>
        <div class="modal-info-col">
          <h2>${menuItem.name}</h2>
          <p class="modal-price">${formatVND(menuItem.price)}</p>
          <p class="muted">${menuItem.description}</p>
          <div class="modal-addons">
            <h4>Tùy Chọn Thêm (${addonLabel})</h4>
            ${addons.map(addon => `
              <label class="addon-option"><input type="checkbox" value="${addon.price}" data-name="${addon.name}" /> ${addon.name}${addon.price > 0 ? ` (+ ${formatVND(addon.price)})` : ''}</label>
            `).join('')}
          </div>
          <div class="qty-row">
            <button class="qty-btn" id="modal-qty-minus">−</button>
            <span class="qty-value" id="modal-qty-value">1</span>
            <button class="qty-btn" id="modal-qty-plus">+</button>
          </div>
          <button class="btn btn-primary btn-full" id="modal-add-btn">Cập Nhật Giỏ Hàng</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("show"));

  const priceEl = overlay.querySelector(".modal-price");
  const checkboxes = overlay.querySelectorAll(".modal-addons input");
  let qty = 1;

  const calculateCurrentUnitPrice = () => {
    let extra = 0;
    checkboxes.forEach(cb => { if (cb.checked) extra += parseFloat(cb.value); });
    return menuItem.price + extra;
  };

  const updateModalDisplay = () => {
    const unitPrice = calculateCurrentUnitPrice();
    priceEl.textContent = formatVND(unitPrice * qty);
  };

  const qtyVal = document.getElementById("modal-qty-value");
  document.getElementById("modal-qty-minus").addEventListener("click", () => {
    if (qty > 1) { qty--; qtyVal.textContent = qty; updateModalDisplay(); }
  });
  document.getElementById("modal-qty-plus").addEventListener("click", () => {
    qty++; qtyVal.textContent = qty; updateModalDisplay();
  });
  checkboxes.forEach(cb => cb.addEventListener("change", updateModalDisplay));

  document.getElementById("modal-close-btn").addEventListener("click", closeProductModal);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeProductModal(); });

  document.getElementById("modal-add-btn").addEventListener("click", () => {
    const unitPrice = calculateCurrentUnitPrice();
    const selectedAddons = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.dataset.name);
    const cart = getCart();

    const itemKey = menuItem.id + (selectedAddons.length ? ":" + selectedAddons.join(",") : "");
    const itemName = menuItem.name + (selectedAddons.length ? ` (${selectedAddons.join(", ")})` : "");

    const found = cart.find(i => (i.cartItemId || i.id) === itemKey);
    if (found) {
      found.quantity += qty;
    } else {
      cart.push({
        cartItemId: itemKey,
        id: menuItem.id,
        name: itemName,
        unit_price: unitPrice,
        image_url: menuItem.image_url || "",
        restaurant_id: menuItem.restaurant_id,
        quantity: qty,
      });
    }
    setCart(cart);
    showFlash("success", `Đã thêm ${qty}x ${itemName} vào giỏ ✓`);
    closeProductModal();
  });
}

function closeProductModal() {
  const overlay = document.getElementById("product-modal-overlay");
  if (overlay) { overlay.classList.remove("show"); setTimeout(() => overlay.remove(), 250); }
}

/* ---------- AUTH PAGE ---------- */
function renderAuth() {
  clearFlash();
  appEl.innerHTML = `
    <section class="auth-shell">
      <div class="auth-intro">
        <div class="auth-kicker">Fast delivery. Fresh cravings. FastBite.</div>
        <h1>Đăng nhập nhanh để món ngon đến đúng lúc.</h1>
        <p>
          FastBite mang trải nghiệm đặt món hiện đại, gọn gàng và đáng tin cậy.
          Chọn đăng nhập hoặc tạo tài khoản để tiếp tục đặt món, theo dõi đơn và lưu địa chỉ giao hàng của bạn.
        </p>
        <div class="auth-highlights">
          <div class="auth-highlight">
            <strong>20'</strong>
            <span>Thời gian giao trung bình trong nội thành cho các món hot.</span>
          </div>
          <div class="auth-highlight">
            <strong>100+</strong>
            <span>Combo, burger, pizza và món ăn nhanh được cập nhật mỗi ngày.</span>
          </div>
          <div class="auth-highlight">
            <strong>24/7</strong>
            <span>Theo dõi đơn theo thời gian thực, tối ưu cho cả mobile và desktop.</span>
          </div>
        </div>
      </div>

      <div class="auth-card-wrap">
        <div class="auth-card">
          <div class="auth-logo">
            <div class="auth-logo-mark">FB</div>
            <div class="auth-logo-copy">
              <strong>FastBite</strong>
              <span>Food Delivery</span>
            </div>
          </div>

          <div class="auth-tabs" role="tablist" aria-label="Xác thực tài khoản">
            <button class="auth-tab active" type="button" data-auth-tab="login" role="tab" aria-selected="true">Đăng Nhập</button>
            <button class="auth-tab" type="button" data-auth-tab="register" role="tab" aria-selected="false">Đăng Ký</button>
          </div>

          <section class="auth-panel active" data-auth-panel="login">
            <h2>Chào mừng bạn quay lại</h2>
            <p>Đăng nhập để tiếp tục đặt món, theo dõi đơn và nhận ưu đãi cá nhân hóa từ FastBite.</p>

            <form class="auth-form" id="login-form">
              <div class="auth-field">
                <label for="login-identity">Email hoặc Số điện thoại</label>
                <input
                  class="auth-input"
                  id="login-identity"
                  name="identity"
                  type="text"
                  placeholder="Email hoặc Số điện thoại"
                  inputmode="email"
                  pattern="(?:[0-9]{10}|[^\\s@]+@[^\\s@]+\\.[^\\s@]+)"
                  title="Nhập email hợp lệ hoặc số điện thoại đúng 10 chữ số"
                  required
                />
              </div>
              <div class="auth-field">
                <label for="login-password">Mật khẩu</label>
                <input
                  class="auth-input"
                  id="login-password"
                  name="password"
                  type="password"
                  placeholder="Mật khẩu"
                  required
                />
              </div>

              <button class="auth-submit" type="submit">Đăng Nhập Ngay</button>
            </form>
          </section>

          <section class="auth-panel" data-auth-panel="register">
            <h2>Tạo tài khoản mới</h2>
            <p>Đăng ký trong vài giây để lưu món yêu thích, địa chỉ giao hàng và lịch sử đơn gần nhất.</p>

            <form class="auth-form" id="register-form">
              <div class="auth-field">
                <label for="register-name">Họ và tên</label>
                <input class="auth-input" id="register-name" name="name" type="text" placeholder="Nhập họ và tên" required />
              </div>
              <div class="auth-field">
                <label for="register-email">Email</label>
                <input class="auth-input" id="register-email" name="email" type="email" placeholder="Nhập email của bạn" autocomplete="email" required />
              </div>
              <div class="auth-field">
                <label for="register-phone">Số điện thoại</label>
                <input class="auth-input" id="register-phone" name="phone" type="tel" placeholder="Nhập số điện thoại" inputmode="numeric" pattern="[0-9]{10}" maxlength="10" title="Số điện thoại phải gồm đúng 10 chữ số" required />
              </div>
              <div class="auth-field">
                <label for="register-password">Mật khẩu</label>
                <input class="auth-input" id="register-password" name="password" type="password" placeholder="Tạo mật khẩu" required />
              </div>
              <button class="auth-submit" type="submit">Tạo Tài Khoản</button>
            </form>
          </section>
        </div>
      </div>
    </section>
  `;

  const tabs = appEl.querySelectorAll("[data-auth-tab]");
  const panels = appEl.querySelectorAll("[data-auth-panel]");
  const setActiveTab = (name) => {
    tabs.forEach((tab) => {
      const isActive = tab.dataset.authTab === name;
      tab.classList.toggle("active", isActive);
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    panels.forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.authPanel === name);
    });
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => setActiveTab(tab.dataset.authTab));
  });

  document.getElementById("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const identity = String(formData.get("identity") || "").trim();
    const password = String(formData.get("password") || "");

    if (!isValidLoginIdentity(identity)) {
      showFlash("error", "Vui lòng nhập email hợp lệ hoặc số điện thoại đúng 10 chữ số.");
      return;
    }

    try {
      const user = await loginUser(identity, password);
      if (user.role !== "customer") {
        showFlash("error", "Tài khoản này không phải customer.");
        return;
      }
      setAuthSession(user.id);
      showFlash("success", "Đăng nhập thành công.");
      routeTo("#/");
    } catch (error) {
      showFlash("error", `Không thể đăng nhập: ${error.message}`);
    }
  });

  document.getElementById("register-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const registerForm = event.currentTarget;
    const formData = new FormData(registerForm);
    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const phone = String(formData.get("phone") || "").trim();
    const password = String(formData.get("password") || "");

    if (!isValidEmail(email)) {
      showFlash("error", "Email không đúng định dạng.");
      return;
    }

    if (!isValidPhone(phone)) {
      showFlash("error", "Số điện thoại phải gồm đúng 10 chữ số.");
      return;
    }

    try {
      await registerCustomer({ name, email, phone, password });
      registerForm.reset();
      setActiveTab("login");

      const loginIdentityInput = document.getElementById("login-identity");
      if (loginIdentityInput) loginIdentityInput.value = email || phone;

      showFlash("success", "Đăng ký thành công. Vui lòng đăng nhập bằng tài khoản vừa tạo.");
    } catch (error) {
      showFlash("error", `Không thể đăng ký: ${error.message}`);
    }
  });
}

function renderManagerAuth() {
  clearFlash();
  const defaultManager = DEFAULT_MANAGER_USER;

  appEl.innerHTML = `
    <section class="auth-shell">
      <div class="auth-intro">
        <div class="auth-kicker">FastBite internal access</div>
        <h1>Đăng nhập manager để vào khu vực quản trị.</h1>
        <p>
          Tài khoản manager được tách riêng hoàn toàn với customer. Chỉ manager mới có thể truy cập dashboard điều hành,
          cập nhật trạng thái đơn hàng và bật tắt món trên thực đơn.
        </p>
        <div class="auth-highlights">
          <div class="auth-highlight">
            <strong>Email</strong>
            <span>${defaultManager.email}</span>
          </div>
          <div class="auth-highlight">
            <strong>SĐT</strong>
            <span>${defaultManager.phone}</span>
          </div>
          <div class="auth-highlight">
            <strong>Mật khẩu</strong>
            <span>${defaultManager.password}</span>
          </div>
        </div>
      </div>

      <div class="auth-card-wrap">
        <div class="auth-card">
          <div class="auth-logo">
            <div class="auth-logo-mark">FM</div>
            <div class="auth-logo-copy">
              <strong>FastBite</strong>
              <span>Manager Access</span>
            </div>
          </div>

          <section class="auth-panel active">
            <h2>Manager Sign In</h2>
            <p>Đăng nhập bằng tài khoản quản trị riêng. Tài khoản customer sẽ không truy cập được dashboard manager.</p>

            <form class="auth-form" id="manager-login-form">
              <div class="auth-field">
                <label for="manager-identity">Email hoặc Số điện thoại manager</label>
                <input
                  class="auth-input"
                  id="manager-identity"
                  name="identity"
                  type="text"
                  placeholder="Email hoặc Số điện thoại manager"
                  inputmode="email"
                  pattern="(?:[0-9]{10}|[^\\s@]+@[^\\s@]+\\.[^\\s@]+)"
                  title="Nhập email hợp lệ hoặc số điện thoại đúng 10 chữ số"
                  required
                />
              </div>
              <div class="auth-field">
                <label for="manager-password">Mật khẩu</label>
                <input
                  class="auth-input"
                  id="manager-password"
                  name="password"
                  type="password"
                  placeholder="Mật khẩu manager"
                  required
                />
              </div>

              <button class="auth-submit" type="submit">Vào Manager Dashboard</button>
            </form>
          </section>
        </div>
      </div>
    </section>
  `;

  document.getElementById("manager-login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const identity = String(formData.get("identity") || "").trim();
    const password = String(formData.get("password") || "");

    if (!isValidLoginIdentity(identity)) {
      showFlash("error", "Vui lòng nhập email hợp lệ hoặc số điện thoại manager đúng 10 chữ số.");
      return;
    }

    try {
      const user = await loginUser(identity, password);
      if (user.role !== "manager") {
        showFlash("error", "Tài khoản này không phải manager.");
        return;
      }
      setManagerSession(user.id);
      showFlash("success", "Đăng nhập manager thành công.");
      routeTo("#/manager");
    } catch (error) {
      showFlash("error", `Không thể đăng nhập manager: ${error.message}`);
    }
  });
}

async function renderProfile() {
  clearFlash();
  const currentCustomer = await getCurrentCustomer();
  const currentUserId = localStorage.getItem(AUTH_SESSION_KEY);

  if (!currentCustomer || !currentUserId) {
    setAuthSession(null);
    routeTo("#/auth");
    return;
  }

  appEl.innerHTML = `
    <section class="profile-shell">
      <div class="profile-hero">
        <p class="manager-eyebrow">Customer Profile</p>
        <h1>Chỉnh sửa thông tin cá nhân</h1>
        <p class="manager-subtext">Cập nhật họ tên, email, số điện thoại và mật khẩu để đồng bộ trải nghiệm đặt món của bạn trên FastBite.</p>
      </div>

      <article class="card profile-card">
        <form id="profile-form" class="stack-sm">
          <div class="form-grid">
            <div>
              <label class="form-label" for="profile-name">Họ và tên</label>
              <input class="input" id="profile-name" name="name" value="${currentCustomer.name || ""}" required />
            </div>
            <div>
              <label class="form-label" for="profile-email">Email</label>
              <input class="input" id="profile-email" name="email" type="email" value="${currentCustomer.email || ""}" required />
            </div>
            <div>
              <label class="form-label" for="profile-phone">Số điện thoại</label>
              <input class="input" id="profile-phone" name="phone" type="tel" inputmode="numeric" pattern="[0-9]{10}" maxlength="10" title="Số điện thoại phải gồm đúng 10 chữ số" value="${currentCustomer.phone || ""}" required />
            </div>
            <div>
              <label class="form-label" for="profile-password">Mật khẩu mới</label>
              <input class="input" id="profile-password" name="password" type="password" placeholder="Để trống nếu không đổi mật khẩu" />
            </div>
          </div>

          <div class="profile-actions">
            <button class="btn btn-outline" type="button" id="profile-cancel">Quay lại trang chủ</button>
            <button class="btn btn-primary" type="submit">Lưu thông tin</button>
          </div>
        </form>
      </article>
    </section>
  `;

  document.getElementById("profile-cancel").addEventListener("click", () => routeTo("#/"));

  document.getElementById("profile-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const phone = String(formData.get("phone") || "").trim();
    const password = String(formData.get("password") || "");

    if (!isValidEmail(email)) {
      showFlash("error", "Email không đúng định dạng.");
      return;
    }

    if (!isValidPhone(phone)) {
      showFlash("error", "Số điện thoại phải gồm đúng 10 chữ số.");
      return;
    }

    try {
      const updatedUser = await api(`/api/users/${currentUserId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name,
          email,
          phone,
          password: password || null,
        }),
      });
      setAuthSession(updatedUser.id);
      showFlash("success", "Đã cập nhật thông tin cá nhân.");
      routeTo("#/");
    } catch (error) {
      showFlash("error", `Không thể cập nhật hồ sơ: ${error.message}`);
    }
  });
}

function closeManagerMenuEditor() {
  const overlay = document.getElementById("manager-menu-editor-overlay");
  if (overlay) {
    overlay.classList.remove("show");
    setTimeout(() => overlay.remove(), 180);
  }
}

function openManagerMenuEditor(menuItem) {
  closeManagerMenuEditor();
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "manager-menu-editor-overlay";
  overlay.innerHTML = `
    <div class="modal-box manager-editor-modal">
      <button class="modal-close" id="manager-editor-close">✕</button>
      <div class="modal-info-col">
        <h2>Chỉnh sửa món ăn</h2>
        <p class="muted">Cập nhật nội dung tại manager, sau đó customer sẽ thấy thay đổi ngay ở trang menu.</p>

        <form id="manager-menu-editor-form" class="stack-sm">
          <div>
            <label class="form-label" for="manager-item-name">Tên món</label>
            <input class="input" id="manager-item-name" name="name" value="${menuItem.name}" required />
          </div>
          <div class="form-grid">
            <div>
              <label class="form-label" for="manager-item-price">Giá</label>
              <input class="input" id="manager-item-price" name="price" type="number" min="1000" step="1000" value="${menuItem.price}" required />
            </div>
            <div>
              <label class="form-label" for="manager-item-category">Danh mục</label>
              <select class="input" id="manager-item-category" name="category" required>
                ${VALID_CATEGORIES.map((category) => `
                  <option value="${category}" ${category === normalizeCategory(menuItem.category, menuItem.name) ? "selected" : ""}>${category}</option>
                `).join("")}
              </select>
            </div>
          </div>
          <div>
            <label class="form-label" for="manager-item-image">Ảnh món</label>
            <input class="input" id="manager-item-image" name="image_url" type="url" value="${menuItem.image_url}" required />
          </div>
          <div>
            <label class="form-label" for="manager-item-description">Mô tả</label>
            <textarea class="textarea" id="manager-item-description" name="description" required>${menuItem.description || ""}</textarea>
          </div>

          <div class="profile-actions">
            <button class="btn btn-outline" type="button" id="manager-editor-cancel">Hủy</button>
            <button class="btn btn-primary" type="submit">Lưu thay đổi</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("show"));

  const closeEditor = () => closeManagerMenuEditor();
  document.getElementById("manager-editor-close").addEventListener("click", closeEditor);
  document.getElementById("manager-editor-cancel").addEventListener("click", closeEditor);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeEditor();
  });

  document.getElementById("manager-menu-editor-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const nextName = String(formData.get("name") || "").trim();
    try {
      await api(`/api/menu-items/${menuItem.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: nextName,
          price: Number(formData.get("price") || menuItem.price),
          category: String(formData.get("category") || menuItem.category).trim(),
          image_url: String(formData.get("image_url") || menuItem.image_url).trim(),
          description: String(formData.get("description") || "").trim(),
        }),
      });
      closeEditor();
      await renderManagerDashboard();
      showFlash("success", `Đã cập nhật món "${nextName}".`);
    } catch (error) {
      showFlash("error", `Không thể cập nhật món ăn: ${error.message}`);
    }
  });
}

/* ---------- MANAGER DASHBOARD ---------- */
async function renderManagerDashboard() {
  clearFlash();
  const { menuItems } = await loadRestaurantMenuCatalog();
  let customerUsers = [];
  try {
    customerUsers = await getUsers("customer");
  } catch {
    customerUsers = [];
  }
  const activeMenuCount = menuItems.filter((item) => item.available !== false).length;
  let orders = [];

  try {
    orders = await api("/api/orders");
  } catch {
    orders = [];
  }

  const orderDetails = await Promise.all(orders.map(async (order) => {
    try {
      return await api(`/api/orders/${order.id}`);
    } catch {
      return { ...order, items: [] };
    }
  }));

  const managerOrders = orderDetails.map((order) => {
    const items = Array.isArray(order.items) ? order.items : [];
    const itemSummary = items.length
      ? items.map((item) => `${item.menu_item_name}${item.quantity > 1 ? ` x${item.quantity}` : ""}`).join(", ")
      : "Chưa có dữ liệu món";

    return {
      id: order.id,
      shortId: String(order.id).slice(0, 8).toUpperCase(),
      customer: order.user_name || "Khách hàng",
      phone: order.user_phone || "",
      item: itemSummary,
      total: Number(order.total_price || 0),
      apiStatus: order.status || "PENDING",
      items,
    };
  });

  const totalOrders = managerOrders.length;
  const totalRevenue = managerOrders.reduce((sum, order) => sum + order.total, 0);
  const itemSales = new Map();
  const customerOrderCounts = new Map();

  managerOrders.forEach((order) => {
    if (order.phone) {
      customerOrderCounts.set(order.phone, (customerOrderCounts.get(order.phone) || 0) + 1);
    }
    order.items.forEach((item) => {
      const current = itemSales.get(item.menu_item_name) || 0;
      itemSales.set(item.menu_item_name, current + Number(item.quantity || 0));
    });
  });

  let bestSellingItem = "Chưa có dữ liệu";
  let bestSellingQty = 0;
  itemSales.forEach((quantity, itemName) => {
    if (quantity > bestSellingQty) {
      bestSellingQty = quantity;
      bestSellingItem = itemName;
    }
  });
  const deliveredOrderCount = managerOrders.filter((order) => order.apiStatus === "DELIVERED").length;
  const activeOrderCount = managerOrders.filter((order) => !["DELIVERED", "CANCELLED"].includes(order.apiStatus)).length;
  const completionRate = totalOrders ? Math.round((deliveredOrderCount / totalOrders) * 100) : 0;
  const averageOrderValue = totalOrders ? Math.round(totalRevenue / totalOrders) : 0;
  const currentDateLabel = new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());

  appEl.innerHTML = `
    <section class="manager-layout">
      <aside class="manager-sidebar">
        <div class="manager-sidebar-brand">
          <div class="manager-sidebar-mark">FB</div>
          <div>
            <strong>FastBite</strong>
            <span>Manager Hub</span>
          </div>
        </div>

        <nav class="manager-nav">
          <button class="manager-nav-item active" type="button" data-manager-scroll="manager-summary">
            <span class="manager-nav-icon">TQ</span>
            <span>Tổng quan</span>
          </button>
          <button class="manager-nav-item" type="button" data-manager-scroll="manager-orders">
            <span class="manager-nav-icon">ĐH</span>
            <span>Quản lý Đơn hàng</span>
          </button>
          <button class="manager-nav-item" type="button" data-manager-scroll="manager-menu">
            <span class="manager-nav-icon">TD</span>
            <span>Quản lý Thực đơn</span>
          </button>
          <button class="manager-nav-item" type="button" data-manager-scroll="manager-customers">
            <span class="manager-nav-icon">KH</span>
            <span>Khách hàng</span>
          </button>
          <button class="manager-nav-item" type="button" data-manager-scroll="manager-reports">
            <span class="manager-nav-icon">BC</span>
            <span>Báo cáo</span>
          </button>
        </nav>

        <div class="manager-sidebar-foot">
          <span>FastBite Admin Panel</span>
          <button class="manager-ghost-btn" id="manager-back-home" type="button">Về trang bán hàng</button>
          <button class="manager-ghost-btn danger" id="manager-logout" type="button">Đăng xuất manager</button>
        </div>
      </aside>

      <div class="manager-main">
        <section class="manager-header">
          <div>
            <p class="manager-eyebrow">Manager Dashboard</p>
            <h1>Vận hành cửa hàng FastBite theo thời gian thực</h1>
            <p class="manager-subtext">Theo dõi đơn mới, hiệu suất bán hàng và trạng thái thực đơn trong một giao diện quản trị gọn gàng.</p>
          </div>
          <div class="manager-header-badge">${currentDateLabel}</div>
        </section>

        <section class="manager-summary-grid" id="manager-summary">
          <article class="manager-summary-card">
            <span>Tổng đơn hàng</span>
            <strong>${totalOrders}</strong>
          </article>
          <article class="manager-summary-card accent">
            <span>Tổng doanh thu</span>
            <strong>${formatVND(totalRevenue)}</strong>
          </article>
          <article class="manager-summary-card">
            <span>Món bán chạy</span>
            <strong>${bestSellingItem}</strong>
          </article>
        </section>

        <section class="manager-panel" id="manager-orders">
          <div class="manager-panel-head">
            <div>
              <p class="manager-panel-kicker">Order Management</p>
              <h2>Danh sách đơn hàng</h2>
            </div>
            <span class="manager-pill">Live update</span>
          </div>

          <div class="manager-table-wrap">
            <table class="manager-table">
              <thead>
                <tr>
                  <th>Mã Đơn</th>
                  <th>Khách hàng</th>
                  <th>Món ăn</th>
                  <th>Tổng tiền</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                ${managerOrders.length ? managerOrders.map((order) => `
                  <tr>
                    <td>${order.shortId}</td>
                    <td>${order.customer}</td>
                    <td>${order.item}</td>
                    <td>${formatVND(order.total)}</td>
                    <td>
                      <div class="manager-status-select ${getManagerStatusClass(order.apiStatus)}">
                        <select data-order-id="${order.id}" ${MANAGER_VALID_TRANSITIONS[order.apiStatus]?.length ? "" : "disabled"}>
                          ${getManagerStatusOptions(order.apiStatus).map((status) => `
                            <option value="${status}" ${status === order.apiStatus ? "selected" : ""}>${getManagerStatusLabel(status)}</option>
                          `).join("")}
                        </select>
                      </div>
                    </td>
                  </tr>
                `).join("") : `
                  <tr>
                    <td colspan="5" class="manager-empty-cell">Chưa có đơn hàng nào trong hệ thống.</td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </section>

        <section class="manager-panel" id="manager-menu">
          <div class="manager-panel-head">
            <div>
              <p class="manager-panel-kicker">Menu Management</p>
              <h2>Thực đơn đang hiển thị</h2>
            </div>
            <span class="manager-pill soft">${activeMenuCount}/${menuItems.length} món đang mở bán</span>
          </div>

          <div class="manager-menu-grid">
            ${menuItems.map((item) => `
              <article class="manager-menu-card">
                <div class="manager-menu-image-wrap">
                  <img src="${item.image_url}" alt="${item.name}" class="manager-menu-image" />
                  <span class="manager-menu-tag">${normalizeCategory(item.category, item.name)}</span>
                </div>
                <div class="manager-menu-body">
                  <div class="manager-menu-topline">
                    <div>
                      <h3>${item.name}</h3>
                      <p>${formatVND(item.price)}</p>
                    </div>
                    <button class="manager-edit-btn" type="button" data-edit-item="${item.id}">
                      <span>✎</span>
                      <span>Chỉnh sửa</span>
                    </button>
                  </div>
                  <div class="manager-toggle-row">
                    <span class="manager-toggle-label">${item.available ? "Đang mở bán" : "Tạm ẩn khỏi menu"}</span>
                    <label class="manager-toggle">
                      <input type="checkbox" data-toggle-item="${item.id}" ${item.available ? "checked" : ""} />
                      <span class="manager-toggle-slider"></span>
                    </label>
                  </div>
                </div>
              </article>
            `).join("")}
          </div>
        </section>

        <section class="manager-panel" id="manager-customers">
          <div class="manager-panel-head">
            <div>
              <p class="manager-panel-kicker">Customer Management</p>
              <h2>Khách hàng</h2>
            </div>
            <span class="manager-pill">${customerUsers.length} tài khoản</span>
          </div>

          <div class="manager-customer-list">
            ${customerUsers.length ? customerUsers.map((customer, index) => `
              <article class="manager-customer-card">
                <div class="manager-customer-avatar">${String(customer.name || "C").trim().charAt(0).toUpperCase()}</div>
                <div>
                  <strong>${customer.name}</strong>
                  <p>${customer.email}</p>
                  <span>${customer.phone}</span>
                </div>
                <div class="manager-customer-meta">
                  <strong>${customerOrderCounts.get(customer.phone) || 0} đơn hàng</strong>
                  <span>${customerOrderCounts.get(customer.phone) ? "Đã từng đặt món" : "Chưa phát sinh đơn"}</span>
                </div>
              </article>
            `).join("") : `
              <article class="card empty-state-card">
                <h3>Chưa có customer nào đăng ký</h3>
                <p class="muted">Các tài khoản customer mới sẽ xuất hiện tại đây để manager theo dõi.</p>
              </article>
            `}
          </div>
        </section>

        <section class="manager-panel" id="manager-reports">
          <div class="manager-panel-head">
            <div>
              <p class="manager-panel-kicker">Reports</p>
              <h2>Báo cáo</h2>
            </div>
            <span class="manager-pill">Tuần này</span>
          </div>

          <div class="manager-report-grid">
            <article class="manager-report-card">
              <strong>Tỷ lệ hoàn thành đơn</strong>
              <p>${deliveredOrderCount}/${totalOrders} đơn đã hoàn thành.</p>
              <div class="manager-progress"><span style="width:${completionRate}%"></span></div>
            </article>
            <article class="manager-report-card">
              <strong>Tỷ lệ mở bán thực đơn</strong>
              <p>${activeMenuCount}/${menuItems.length} món hiện đang hiển thị cho customer.</p>
              <div class="manager-progress"><span style="width:${Math.round((activeMenuCount / Math.max(menuItems.length, 1)) * 100)}%"></span></div>
            </article>
            <article class="manager-report-card">
              <strong>Đơn đang xử lý</strong>
              <p>${activeOrderCount} đơn đang ở các trạng thái chờ, chế biến hoặc giao hàng. Giá trị trung bình ${formatVND(averageOrderValue)}.</p>
              <div class="manager-progress"><span style="width:${totalOrders ? Math.round((activeOrderCount / totalOrders) * 100) : 0}%"></span></div>
            </article>
          </div>
        </section>
      </div>
    </section>
  `;

  appEl.querySelectorAll("[data-manager-scroll]").forEach((button) => {
    button.addEventListener("click", () => {
      const targetId = button.dataset.managerScroll;
      const target = document.getElementById(targetId);
      if (!target) return;

      appEl.querySelectorAll("[data-manager-scroll]").forEach((item) => {
        item.classList.toggle("active", item === button);
      });
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  document.getElementById("manager-back-home").addEventListener("click", () => routeTo("#/"));
  document.getElementById("manager-logout").addEventListener("click", () => {
    setManagerSession(null);
    routeTo("#/manager-auth");
  });

  appEl.querySelectorAll(".manager-status-select select").forEach((select) => {
    select.addEventListener("change", async () => {
      try {
        const nextStatus = select.value;
        await api(`/api/orders/${select.dataset.orderId}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status: nextStatus }),
        });
        await renderManagerDashboard();
        showFlash("success", `Đã cập nhật trạng thái đơn ${select.dataset.orderId.slice(0, 8).toUpperCase()} thành "${getManagerStatusLabel(nextStatus)}".`);
      } catch (error) {
        await renderManagerDashboard();
        showFlash("error", `Không thể cập nhật trạng thái đơn: ${error.message}`);
      }
    });
  });

  appEl.querySelectorAll("[data-toggle-item]").forEach((toggle) => {
    toggle.addEventListener("change", async () => {
      try {
        await api(`/api/menu-items/${toggle.dataset.toggleItem}/availability`, {
          method: "PATCH",
          body: JSON.stringify({ available: toggle.checked }),
        });
        await renderManagerDashboard();
        showFlash("success", toggle.checked ? "Đã bật món trên thực đơn." : "Đã tắt món khỏi thực đơn.");
      } catch (error) {
        toggle.checked = !toggle.checked;
        showFlash("error", `Không thể cập nhật hiển thị món: ${error.message}`);
      }
    });
  });

  appEl.querySelectorAll("[data-edit-item]").forEach((button) => {
    button.addEventListener("click", () => {
      const menuItem = menuItems.find((item) => item.id === button.dataset.editItem);
      if (menuItem) openManagerMenuEditor(menuItem);
    });
  });
}

/* ---------- HOME PAGE ---------- */
async function renderHome() {
  clearFlash();
  showLoading();
  try {
    const { menuItems } = await loadRestaurantMenuCatalog();
    const allMenuItems = menuItems.filter((item) => item.available !== false);
    _allMenuItemsCache = allMenuItems;
    const itemById = new Map(allMenuItems.map((item) => [item.id, item]));
    let selectedCategory = "Tất Cả";

    appEl.innerHTML = `
      <section class="hero">
        <h2>Hot & Fresh Fast Food </h2>
        <p>Bấm vào danh mục để xem các món tương ứng và chọn món ngay.</p>
        <div class="category-tabs" id="category-tabs">
          ${HOME_CATEGORY_TABS.map(
            (category) => `<button class="chip-btn ${category === "Tất Cả" ? "active" : ""}" data-category="${category}">${category}</button>`
          ).join("")}
        </div>
      </section>
      <h2 class="section-title">Món Ăn Nhanh</h2>
      <div id="home-menu-grid" class="grid menu-grid"></div>
    `;

    const homeMenuGrid = document.getElementById("home-menu-grid");
    const renderCategoryItems = () => {
      const visibleItems = selectedCategory === "Tất Cả" ? allMenuItems
        : allMenuItems.filter((item) => item.category_label === selectedCategory);

      if (!visibleItems.length) {
        homeMenuGrid.innerHTML = `
          <article class="card empty-state-card">
            <div class="empty-icon">🍽️</div>
            <h3>Danh mục này chưa có món</h3>
            <p class="muted">Bạn thử chọn danh mục khác hoặc quay lại sau nhé.</p>
          </article>`;
        return;
      }

      homeMenuGrid.innerHTML = visibleItems.map((item) => `
        <article class="card menu-option-card" data-item-id="${item.id}">
          <div class="menu-image-wrap">
            <img class="menu-image" src="${item.image_url}" alt="${item.name}" loading="lazy" />
          </div>
          <div class="row"><strong>${item.name}</strong><strong class="menu-price">${formatVND(item.price)}</strong></div>
          <p class="muted">${item.description}</p>
          <div class="row menu-origin"><span class="tag">${item.category_label}</span></div>
          <div class="row menu-actions">
            <button class="btn btn-primary add-home-item-btn" data-item-id="${item.id}" ${!item.available ? "disabled" : ""}>
              ${item.available ? "Thêm Vào Giỏ" : "Tạm Hết"}
            </button>
          </div>
        </article>
      `).join("");

      homeMenuGrid.querySelectorAll(".add-home-item-btn").forEach((button) => {
        button.addEventListener("click", (e) => {
          e.stopPropagation();
          const menuItem = itemById.get(button.dataset.itemId);
          if (menuItem) addToCart(menuItem);
        });
      });

      homeMenuGrid.querySelectorAll(".menu-option-card").forEach((card) => {
        card.style.cursor = "pointer";
        card.addEventListener("click", () => {
          const menuItem = itemById.get(card.dataset.itemId);
          if (menuItem) openProductModal(menuItem);
        });
      });
    };

    renderCategoryItems();

    appEl.querySelectorAll(".chip-btn").forEach((button) => {
      button.addEventListener("click", () => {
        selectedCategory = button.dataset.category;
        appEl.querySelectorAll(".chip-btn").forEach((chip) => {
          chip.classList.toggle("active", chip.dataset.category === selectedCategory);
        });
        renderCategoryItems();
      });
    });
  } catch (error) {
    showFlash("error", `Failed to load restaurants: ${error.message}`);
    appEl.innerHTML = "";
  }
}

/* ---------- ENHANCED CART PAGE ---------- */
function renderCart() {
  clearFlash();
  const cart = getCart();
  const total = cart.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);

  if (cart.length === 0) {
    appEl.innerHTML = `
      <h2 class="section-title">Giỏ Hàng Của Bạn</h2>
      <article class="card empty-state-card">
        <div class="empty-icon">🛒</div>
        <h3>Giỏ hàng đang trống</h3>
        <p class="muted">Hãy thêm món ăn yêu thích của bạn từ danh sách món.</p>
        <button class="btn btn-primary" style="margin-top:14px" onclick="routeTo('#/')">Xem Thực Đơn</button>
      </article>`;
    return;
  }

  appEl.innerHTML = `
    <h2 class="section-title">Giỏ Hàng Của Bạn</h2>
    <div class="cart-list" id="cart-list">
      ${cart.map((item, idx) => `
        <div class="cart-item card" data-index="${idx}">
          <img class="cart-item-img" src="${item.image_url || 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=80&q=60'}" alt="${item.name}" />
          <div class="cart-item-info">
            <strong>${item.name}</strong>
            <span class="menu-price">${formatVND(item.unit_price)}</span>
          </div>
          <div class="qty-row">
            <button class="qty-btn cart-qty-minus" data-index="${idx}">−</button>
            <span class="qty-value">${item.quantity}</span>
            <button class="qty-btn cart-qty-plus" data-index="${idx}">+</button>
          </div>
          <span class="cart-item-subtotal">${formatVND(item.quantity * item.unit_price)}</span>
          <button class="btn btn-danger-text cart-remove-btn" data-index="${idx}">Xóa</button>
        </div>
      `).join("")}
    </div>
    <div class="cart-summary card">
      <div class="row"><strong style="font-size:18px">Tổng cộng:</strong><strong style="font-size:22px;color:var(--primary)">${formatVND(total)}</strong></div>
      <button class="btn btn-primary btn-full" id="go-checkout-btn" style="margin-top:14px;font-size:16px;padding:14px">Thanh Toán Ngay</button>
    </div>
  `;

  document.getElementById("go-checkout-btn").addEventListener("click", () => routeTo("#/checkout"));

  appEl.querySelectorAll(".cart-qty-minus").forEach(btn => {
    btn.addEventListener("click", () => {
      const cart = getCart(); const idx = Number(btn.dataset.index);
      if (cart[idx].quantity > 1) { cart[idx].quantity--; setCart(cart); renderCart(); }
    });
  });
  appEl.querySelectorAll(".cart-qty-plus").forEach(btn => {
    btn.addEventListener("click", () => {
      const cart = getCart(); const idx = Number(btn.dataset.index);
      cart[idx].quantity++; setCart(cart); renderCart();
    });
  });
  appEl.querySelectorAll(".cart-remove-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const cart = getCart(); const idx = Number(btn.dataset.index);
      cart.splice(idx, 1); setCart(cart); showFlash("success", "Đã xóa khỏi giỏ hàng"); renderCart();
    });
  });
}

/* ---------- ENHANCED CHECKOUT PAGE ---------- */
function renderCheckout() {
  clearFlash();
  const cart = getCart();
  const total = cart.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);

  if (cart.length === 0) {
    appEl.innerHTML = `
      <h2 class="section-title">Thanh Toán Đơn Hàng</h2>
      <article class="card empty-state-card">
        <div class="empty-icon">🛒</div>
        <h3>Giỏ hàng đang trống</h3>
        <p class="muted">Bạn cần thêm món trước khi thanh toán.</p>
        <button class="btn btn-primary" style="margin-top:14px" onclick="routeTo('#/')">Xem Thực Đơn</button>
      </article>`;
    return;
  }

  appEl.innerHTML = `
    <h2 class="section-title">Thanh Toán Đơn Hàng</h2>
    <form id="checkout-form" class="checkout-grid">
      <div class="checkout-col-left card">
        <h3>Thông Tin Giao Hàng</h3>
        <div class="stack-sm">
          <div><label class="form-label">Họ và Tên</label><input class="input" name="user_name" placeholder="Họ và tên" required /></div>
          <div><label class="form-label">Số điện thoại</label><input class="input" name="user_phone" type="tel" inputmode="numeric" pattern="[0-9]{10}" maxlength="10" title="Số điện thoại phải gồm đúng 10 chữ số" required /></div>
          <div><label class="form-label">Địa chỉ giao hàng</label><input class="input" name="delivery_address" required /></div>
          <div><label class="form-label">Ghi chú</label><textarea class="textarea" name="note" placeholder="Ghi chú cho shipper (không bắt buộc)"></textarea></div>
        </div>
      </div>
      <div class="checkout-col-right card">
        <h3>Đơn Hàng & Thanh Toán</h3>
        <div class="checkout-order-list">
          ${cart.map(item => `
            <div class="row checkout-item">
              <span>${item.name} <span class="muted">x${item.quantity}</span></span>
              <span>${formatVND(item.quantity * item.unit_price)}</span>
            </div>
          `).join("")}
        </div>
        <hr class="divider" />
        <h4>Phương thức thanh toán</h4>
        <div class="payment-methods">
          <label class="radio-option"><input type="radio" name="payment" value="cod" checked /> COD (Thanh toán khi nhận hàng)</label>
          <label class="radio-option"><input type="radio" name="payment" value="bank" /> Chuyển khoản ngân hàng</label>
          <label class="radio-option"><input type="radio" name="payment" value="momo" /> Ví Momo</label>
        </div>
        <hr class="divider" />
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <input class="input" style="flex:1;min-width:150px" placeholder="Mã giảm giá" id="discount-code" />
          <button type="button" class="btn btn-outline" id="apply-discount-btn">Áp dụng</button>
        </div>
        <hr class="divider" />
        <div class="row"><strong style="font-size:18px">Tổng thanh toán:</strong><strong style="font-size:22px;color:var(--primary)" id="checkout-total">${formatVND(total)}</strong></div>
        <button class="btn btn-primary btn-full" type="submit" style="margin-top:14px;font-size:16px;padding:14px">Xác Nhận Đặt Hàng</button>
      </div>
    </form>
  `;

  document.getElementById("apply-discount-btn").addEventListener("click", () => {
    const code = document.getElementById("discount-code").value.trim();
    if (code.toUpperCase() === "FASTBITE10") {
      const discounted = total * 0.9;
      document.getElementById("checkout-total").textContent = formatVND(discounted);
      showFlash("success", "Đã áp dụng mã giảm giá 10%!");
    } else if (code) {
      showFlash("error", "Mã giảm giá không hợp lệ");
    }
  });

  const form = document.getElementById("checkout-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const currentCart = getCart();
    if (currentCart.length === 0) return;

    const formData = new FormData(form);
    const userPhone = String(formData.get("user_phone") || "").trim();

    if (!isValidPhone(userPhone)) {
      showFlash("error", "Số điện thoại giao hàng phải gồm đúng 10 chữ số.");
      return;
    }

    const restaurantIds = [...new Set(currentCart.map((item) => item.restaurant_id))].filter(id => id !== null);

    let resolvedRestId = restaurantIds[0];
    if (!resolvedRestId && _allMenuItemsCache.length > 0) {
      const firstWithId = _allMenuItemsCache.find(i => i.restaurant_id);
      if (firstWithId) resolvedRestId = firstWithId.restaurant_id;
    }

    const payload = {
      user_name: String(formData.get("user_name") || "").trim(),
      user_phone: userPhone,
      restaurant_id: resolvedRestId || "res-fastbite-1",
      delivery_address: String(formData.get("delivery_address") || "").trim(),
      note: String(formData.get("note") || "").trim() || null,
      items: currentCart.map((item) => ({
        menu_item_id: item.id,
        menu_item_name: item.name,
        quantity: item.quantity,
        unit_price: item.unit_price,
      })),
    };

    try {
      await api("/api/orders", { method: "POST", body: JSON.stringify(payload) });
      setCart([]);
      showFlash("success", "Đặt hàng thành công! 🎉");
      routeTo("#/tracking");
    } catch (error) {
      showFlash("error", `Lỗi đặt hàng: ${error.message}`);
    }
  });
}

/* ---------- ENHANCED TRACKING PAGE ---------- */
const STATUS_STEPS = [
  { key: "PENDING", label: "Đã nhận đơn", icon: "📋" },
  { key: "CONFIRMED", label: "Đã xác nhận", icon: "✅" },
  { key: "PREPARING", label: "Đang chế biến", icon: "👨‍🍳" },
  { key: "DELIVERING", label: "Đang Giao Hàng", icon: "🛵" },
  { key: "DELIVERED", label: "Đã Hoàn Thành", icon: "✅" },
];

function getStepIndex(status) {
  if (status === "CANCELLED") return -1;
  const idx = STATUS_STEPS.findIndex(s => s.key === status);
  return idx >= 0 ? idx : 0;
}

function renderProgressBar(status) {
  if (status === "CANCELLED") {
    return `
      <div class="card empty-state-card">
        <h3>Đơn hàng đã bị hủy</h3>
        <p class="muted">Đơn này không còn trong quy trình xử lý hoặc giao hàng.</p>
      </div>
    `;
  }

  const activeIdx = getStepIndex(status);
  return `
    <div class="progress-bar">
      ${STATUS_STEPS.map((step, i) => `
        <div class="progress-step ${i <= activeIdx ? "active" : ""} ${i === activeIdx ? "current" : ""}">
          <div class="step-icon">${step.icon}</div>
          <div class="step-label">${step.label}</div>
        </div>
        ${i < STATUS_STEPS.length - 1 ? `<div class="step-line ${i < activeIdx ? "active" : ""}"></div>` : ""}
      `).join("")}
    </div>
  `;
}

async function renderTracking() {
  clearFlash();
  appEl.innerHTML = `
    <h2 class="section-title">Theo Dõi Đơn Hàng</h2>
    <div class="card stack-sm" style="margin-bottom:16px">
      <form id="tracking-form" class="row" style="align-items:flex-end; flex-wrap:wrap; gap:10px">
        <div style="flex:1; min-width:220px">
          <label class="muted">Số điện thoại</label>
          <input class="input" name="user_phone" type="tel" inputmode="numeric" pattern="[0-9]{10}" maxlength="10" title="Số điện thoại phải gồm đúng 10 chữ số" required placeholder="Nhập số điện thoại" />
        </div>
        <button class="btn btn-primary" type="submit">Tìm Đơn</button>
      </form>
    </div>
    <div id="tracking-results"></div>
  `;

  const form = document.getElementById("tracking-form");
  const results = document.getElementById("tracking-results");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const userPhone = String(new FormData(form).get("user_phone") || "").trim();

    if (!isValidPhone(userPhone)) {
      showFlash("error", "Số điện thoại tìm đơn phải gồm đúng 10 chữ số.");
      results.innerHTML = "";
      return;
    }

    results.innerHTML = '<div class="spinner"></div>';

    try {
      const orders = await api(`/api/orders?user_phone=${encodeURIComponent(userPhone)}`);
      if (!orders.length) {
        results.innerHTML = '<p class="muted">Không tìm thấy đơn hàng nào.</p>';
        return;
      }

      results.innerHTML = "";
      for (const order of orders) {
        let orderDetail = null;
        try { orderDetail = await api(`/api/orders/${order.id}`); } catch {}

        const status = order.status || "PENDING";
        const items = orderDetail?.items || [];
        const totalPrice = Number(order.total_price || 0);
        const shortId = order.id.slice(0, 8).toUpperCase();

        const orderCard = document.createElement("article");
        orderCard.className = "card tracking-card";
        orderCard.innerHTML = `
          <div class="row" style="margin-bottom:16px">
            <strong style="font-size:18px">Đơn #${shortId}</strong>
            <span class="badge ${status}">${status}</span>
          </div>

          <h4 class="section-subtitle">Trạng Thái Đơn Hàng</h4>
          ${renderProgressBar(status)}

          <div class="tracking-details">
            <div class="tracking-info-grid">
              <div class="tracking-info-item"><span class="muted">Số Đơn Hàng</span><strong>#FB-${shortId}</strong></div>
              <div class="tracking-info-item"><span class="muted">Địa Chỉ Giao Hàng</span><strong>${order.delivery_address || "Chưa cập nhật"}</strong></div>
              <div class="tracking-info-item"><span class="muted">Dự kiến giao hàng</span><strong>30 - 45 phút</strong></div>
              <div class="tracking-info-item"><span class="muted">Tên Shipper</span><strong>${status === "DELIVERING" || status === "DELIVERED" ? "Nguyễn Văn An" : "Đang tìm shipper..."}</strong></div>
            </div>
          </div>

          ${items.length > 0 ? `
            <h4 class="section-subtitle">Chi Tiết Món</h4>
            <div class="tracking-items">
              ${items.map(item => `
                <div class="row tracking-item-row">
                  <span>${item.menu_item_name} <span class="muted">x${item.quantity}</span></span>
                  <span>${formatVND(item.quantity * item.unit_price)}</span>
                </div>
              `).join("")}
              <hr class="divider" />
              <div class="row"><strong>Tổng cộng</strong><strong class="menu-price">${formatVND(totalPrice)}</strong></div>
            </div>
          ` : `<p class="muted">Tổng: ${formatVND(totalPrice)}</p>`}

          <div class="tracking-map">
            <div class="map-placeholder">
              <span class="map-icon">🗺️</span>
              <span>Bản đồ giao hàng</span>
              <div class="map-route">
                <div class="map-pin map-pin-start">🏪</div>
                <div class="map-line-anim"></div>
                <div class="map-pin map-pin-end">📍</div>
              </div>
            </div>
          </div>
        `;
        results.appendChild(orderCard);
      }
    } catch (error) {
      results.innerHTML = "";
      showFlash("error", `Lỗi tải đơn hàng: ${error.message}`);
    }
  });
}

/* ---------- ROUTER ---------- */
async function render() {
  if (ensureInitialRoute()) return;
  const route = parseRoute();
  const customerProtectedPages = new Set(["home", "profile", "cart", "checkout", "tracking"]);

  if (route.page === "manager" && !hasManagerSession()) {
    routeTo("#/manager-auth");
    return;
  }

  if (customerProtectedPages.has(route.page) && !hasAuthSession()) {
    routeTo("#/auth");
    return;
  }
  updateChrome(route.page);
  if (route.page === "auth") return renderAuth();
  if (route.page === "profile") return renderProfile();
  if (route.page === "manager-auth") return renderManagerAuth();
  if (route.page === "manager") return renderManagerDashboard();
  if (route.page === "home") return renderHome();
  if (route.page === "cart") return renderCart();
  if (route.page === "checkout") return renderCheckout();
  if (route.page === "tracking") return renderTracking();
}

window.addEventListener("hashchange", render);
window.addEventListener("storage", (event) => {
  if ([AUTH_SESSION_KEY, MANAGER_SESSION_KEY].includes(event.key || "")) {
    render();
  }
});
navHomeEl.addEventListener("click", () => routeTo(hasAuthSession() ? "#/" : "#/auth"));
navAuthEl.addEventListener("click", () => {
  if (hasAuthSession()) {
    setAuthSession(null);
    routeTo("#/auth");
    return;
  }
  routeTo("#/auth");
});
navProfileEl.addEventListener("click", () => routeTo("#/profile"));
navCheckoutEl.addEventListener("click", () => routeTo("#/cart"));
navTrackingEl.addEventListener("click", () => routeTo("#/tracking"));

render();
