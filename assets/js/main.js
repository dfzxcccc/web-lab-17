let allProducts = [];

const CART_STORAGE_KEY = 'techshop_cart';
const THEME_STORAGE_KEY = 'techshop_theme';
const DRAFT_ORDER_KEY = 'techshop_order_draft';

let cart = loadCartFromStorage();

const CATALOG_DEFAULTS = Object.freeze({
  q: '',
  category: 'all',
  sort: 'default',
  page: 1
});

const ALLOWED_SORTS = ['default', 'price_asc', 'price_desc', 'title_asc', 'rating_desc'];
const PRODUCTS_PER_PAGE = 6;
const MAX_QUERY_LENGTH = 50;

let catalogState = { ...CATALOG_DEFAULTS };

const searchInput = document.getElementById('searchInput');
const categorySelect = document.getElementById('categorySelect');
const sortSelect = document.getElementById('sortSelect');
const resetFiltersBtn = document.getElementById('resetFiltersBtn');
const shareLinkBtn = document.getElementById('shareLinkBtn');
const paginationContainer = document.getElementById('pagination');
const catalogInfo = document.getElementById('catalogInfo');

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  setupThemeToggle();
  initShop();
  setupCatalogEvents();
  setupCheckoutForm();
  setupLivePromoListener();
  restoreOrderFormDraft();
  setupStorageSync();
  setupHistoryNavigation();
});

function loadCartFromStorage() {
  const rawData = localStorage.getItem(CART_STORAGE_KEY);
  if (!rawData) return [];
  try {
    const parsed = JSON.parse(rawData);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    localStorage.removeItem(CART_STORAGE_KEY);
    return [];
  }
}

function saveCartToStorage() {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
}

function applyTheme(themeName) {
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const themeIcon = themeToggleBtn?.querySelector('.theme-icon');
  const themeText = themeToggleBtn?.querySelector('.theme-text');

  if (themeName === 'light') {
    document.body.classList.add('light-theme');
    if (themeIcon) themeIcon.textContent = '🌙';
    if (themeText) themeText.textContent = 'Світла тема';
  } else {
    document.body.classList.remove('light-theme');
    if (themeIcon) themeIcon.textContent = '☀️';
    if (themeText) themeText.textContent = 'Темна тема';
  }
}

function initTheme() {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'dark';
  applyTheme(savedTheme);
}

function setupThemeToggle() {
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  if (!themeToggleBtn) return;

  themeToggleBtn.addEventListener('click', () => {
    const isLight = document.body.classList.contains('light-theme');
    const newTheme = isLight ? 'dark' : 'light';
    applyTheme(newTheme);
    localStorage.setItem(THEME_STORAGE_KEY, newTheme);
  });
}

function readStateFromURL() {
  const params = new URLSearchParams(window.location.search);

  const q = (params.get('q') || '').trim().slice(0, MAX_QUERY_LENGTH);
  const category = params.get('category') || CATALOG_DEFAULTS.category;
  const rawSort = params.get('sort');
  const sort = ALLOWED_SORTS.includes(rawSort) ? rawSort : CATALOG_DEFAULTS.sort;

  const rawPage = Number.parseInt(params.get('page'), 10);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : CATALOG_DEFAULTS.page;

  return { q, category, sort, page };
}

function getAvailableCategories(products) {
  return [...new Set(products.map(product => product.category))];
}

function validateCategory(category) {
  if (category === 'all') return 'all';
  const categories = getAvailableCategories(allProducts);
  return categories.includes(category) ? category : CATALOG_DEFAULTS.category;
}

function buildCatalogURL(state) {
  const url = new URL(window.location.href);
  const params = new URLSearchParams();

  if (state.q) params.set('q', state.q);
  if (state.category !== CATALOG_DEFAULTS.category) params.set('category', state.category);
  if (state.sort !== CATALOG_DEFAULTS.sort) params.set('sort', state.sort);
  if (state.page !== CATALOG_DEFAULTS.page) params.set('page', String(state.page));

  url.search = params.toString();
  return url;
}

function syncURL(mode = 'push') {
  const newURL = buildCatalogURL(catalogState);
  if (newURL.href === window.location.href) return;

  const stateSnapshot = { ...catalogState };

  if (mode === 'replace') {
    history.replaceState(stateSnapshot, '', newURL);
  } else {
    history.pushState(stateSnapshot, '', newURL);
  }
}

function filterProducts(products, { q, category }) {
  const normalizedQuery = q.toLowerCase();

  return products.filter(product => {
    const matchesQuery = product.title.toLowerCase().includes(normalizedQuery);
    const matchesCategory = category === 'all' || product.category === category;
    return matchesQuery && matchesCategory;
  });
}

function sortProducts(products, sort) {
  const sorted = [...products];

  switch (sort) {
    case 'price_asc':
      return sorted.sort((a, b) => a.price - b.price);
    case 'price_desc':
      return sorted.sort((a, b) => b.price - a.price);
    case 'title_asc':
      return sorted.sort((a, b) => a.title.localeCompare(b.title));
    case 'rating_desc':
      return sorted.sort((a, b) => (b.rating?.rate ?? 0) - (a.rating?.rate ?? 0));
    default:
      return sorted;
  }
}

function paginateProducts(products, page, perPage) {
  const totalItems = products.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
  const currentPage = Math.min(Math.max(page, 1), totalPages);

  const startIndex = (currentPage - 1) * perPage;
  const endIndex = startIndex + perPage;

  return {
    items: products.slice(startIndex, endIndex),
    totalItems,
    totalPages,
    currentPage,
    startIndex
  };
}

function updateCatalog(historyMode = null) {
  const filtered = filterProducts(allProducts, catalogState);
  const sorted = sortProducts(filtered, catalogState.sort);
  const { items, totalItems, totalPages, currentPage, startIndex } =
    paginateProducts(sorted, catalogState.page, PRODUCTS_PER_PAGE);

  if (currentPage !== catalogState.page) {
    catalogState.page = currentPage;
    historyMode = historyMode || 'replace';
  }

  renderProducts(items);
  renderPagination(currentPage, totalPages);
  renderCatalogInfo(totalItems, startIndex, items.length);

  if (historyMode) {
    syncURL(historyMode);
  }
}

function renderCatalogInfo(totalItems, startIndex, shownCount) {
  if (!catalogInfo) return;

  if (totalItems === 0) {
    catalogInfo.textContent = catalogState.q
      ? `За запитом «${catalogState.q}» нічого не знайдено`
      : 'У цій категорії поки немає товарів';
    return;
  }

  const from = startIndex + 1;
  const to = startIndex + shownCount;
  catalogInfo.textContent = `Показано ${from}–${to} з ${totalItems} товарів`;
}

function renderPagination(currentPage, totalPages) {
  if (!paginationContainer) return;

  if (totalPages <= 1) {
    paginationContainer.innerHTML = '';
    return;
  }

  const pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1);

  paginationContainer.innerHTML = `
    <button class="page-btn" data-page="${currentPage - 1}"
      ${currentPage === 1 ? 'disabled' : ''} aria-label="Попередня сторінка">‹</button>

    ${pageNumbers.map(number => `
      <button class="page-btn ${number === currentPage ? 'is-active' : ''}"
        data-page="${number}"
        ${number === currentPage ? 'aria-current="page"' : ''}>${number}</button>
    `).join('')}

    <button class="page-btn" data-page="${currentPage + 1}"
      ${currentPage === totalPages ? 'disabled' : ''} aria-label="Наступна сторінка">›</button>
  `;
}

function applyStateToControls() {
  if (searchInput) searchInput.value = catalogState.q;
  if (categorySelect) categorySelect.value = catalogState.category;
  if (sortSelect) sortSelect.value = catalogState.sort;
}

function populateCategorySelect(products) {
  if (!categorySelect) return;

  const categories = getAvailableCategories(products);
  categorySelect.innerHTML = '<option value="all">Усі категорії</option>';

  categories.forEach(category => {
    if (!category) return;
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category.charAt(0).toUpperCase() + category.slice(1);
    categorySelect.append(option);
  });
}

function debounce(callback, delay = 300) {
  let timerId = null;
  return (...args) => {
    clearTimeout(timerId);
    timerId = setTimeout(() => callback(...args), delay);
  };
}

function setupCatalogEvents() {
  if (searchInput) {
    const handleSearch = debounce((value) => {
      catalogState.q = value.trim().slice(0, MAX_QUERY_LENGTH);
      catalogState.page = 1;
      updateCatalog('replace');
    }, 300);

    searchInput.addEventListener('input', (event) => handleSearch(event.target.value));
  }

  if (categorySelect) {
    categorySelect.addEventListener('change', (event) => {
      catalogState.category = event.target.value;
      catalogState.page = 1;
      updateCatalog('push');
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener('change', (event) => {
      catalogState.sort = event.target.value;
      catalogState.page = 1;
      updateCatalog('push');
    });
  }

  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener('click', () => {
      catalogState = { ...CATALOG_DEFAULTS };
      applyStateToControls();
      updateCatalog('push');
    });
  }

  if (shareLinkBtn) {
    shareLinkBtn.addEventListener('click', async () => {
      const originalText = shareLinkBtn.textContent;
      try {
        await navigator.clipboard.writeText(window.location.href);
        shareLinkBtn.textContent = '✅ Скопійовано';
      } catch (error) {
        console.error('Не вдалося скопіювати посилання:', error);
        window.prompt('Скопіюйте посилання вручну:', window.location.href);
      }
      setTimeout(() => {
        shareLinkBtn.textContent = originalText;
      }, 2000);
    });
  }

  if (paginationContainer) {
    paginationContainer.addEventListener('click', (event) => {
      const button = event.target.closest('.page-btn');
      if (!button || button.disabled) return;

      const targetPage = Number(button.dataset.page);
      if (targetPage === catalogState.page) return;

      catalogState.page = targetPage;
      updateCatalog('push');

      document.querySelector('.catalog-toolbar')?.scrollIntoView({ behavior: 'smooth' });
    });
  }

  const grid = document.querySelector('.products-grid');
  if (grid) {
    grid.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-buy')) {
        const heroId = parseInt(e.target.dataset.id, 10);
        addToCart(heroId);
      }
    });
  }

  const cartBtn = document.querySelector('.btn-cart');
  const cartOverlay = document.getElementById('cartOverlay');
  const closeCartBtn = document.getElementById('closeCartBtn');

  if (cartBtn && cartOverlay) {
    cartBtn.addEventListener('click', () => cartOverlay.classList.remove('hidden'));
  }
  if (closeCartBtn && cartOverlay) {
    closeCartBtn.addEventListener('click', () => cartOverlay.classList.add('hidden'));
  }

  document.addEventListener('click', (event) => {
    if (event.target.classList.contains('remove-item-btn')) {
      const index = parseInt(event.target.dataset.index, 10);
      cart.splice(index, 1);
      saveCartToStorage();
      updateCartSummary();
    }

    if (event.target.id === 'clearCartBtn') {
      cart = [];
      saveCartToStorage();
      updateCartSummary();
    }
  });
}

function setupHistoryNavigation() {
  window.addEventListener('popstate', () => {
    catalogState = readStateFromURL();
    catalogState.category = validateCategory(catalogState.category);

    applyStateToControls();
    updateCatalog();
  });
}

async function initShop() {
  const loader = document.getElementById('loader');
  const grid = document.querySelector('.products-grid');

  try {
    const response = await fetch('heroes.json');
    if (!response.ok) throw new Error('Помилка завантаження файлу');
    
    let rawData = await response.json();
    
    allProducts = rawData.map(item => {
      const name = item.title.toLowerCase();
      let price = 100;

      if (name.includes('invoker')) price = 300;
      else if (name.includes('arc warden')) price = 300;
      else if (name.includes('broodmother')) price = 300;
      else if (name.includes('grimstroke')) price = 500;
      else if (name.includes('beastmaster')) price = 200;
      else if (name.includes('keeper of the light')) price = 200;
      else if (name.includes('wisp') || name.includes('io')) price = 300;
      else if (name.includes('drow ranger')) price = 200;
      else if (name.includes('terrorblade')) price = 300;
      else if (name.includes('phantom lancer')) price = 300;
      else if (name.includes('templar assassin')) price = 200;
      else if (name.includes('shadow fiend')) price = 200;
      else if (name.includes('luna')) price = 200;
      else if (name.includes('morphling')) price = 300;
      else if (name.includes('pudge')) price = 100;
      else if (name.includes('anti-mage') || name.includes('antimage')) price = 100;
      else if (name.includes('juggernaut')) price = 100;
      else if (name.includes('dazzle')) price = 100;
      else if (name.includes('shadow shaman')) price = 100;
      else if (name.includes('crystal maiden')) price = 100;
      else if (name.includes('treant protector')) price = 100;
      else if (name.includes('oracle')) price = 100;
      else if (name.includes('dark willow')) price = 100;
      else if (name.includes('lich')) price = 100;

      return {
        ...item,
        price: price
      };
    });

    if (loader) loader.style.display = 'none';
    if (grid) grid.style.display = 'grid';

    populateCategorySelect(allProducts);
    catalogState = readStateFromURL();
    catalogState.category = validateCategory(catalogState.category);
    applyStateToControls();
    updateCatalog('replace');
    updateCartSummary();

  } catch (error) {
    if (loader) loader.textContent = 'Помилка завантаження персонажів.';
    console.error('Error loading heroes:', error);
  }
}

function renderProducts(products) {
  const container = document.querySelector('.products-grid');
  if (!container) return;

  if (!products || products.length === 0) {
    container.innerHTML = '<p style="color:#c19a5b; grid-column: 1/-1; text-align: center;">Героїв не знайдено</p>';
    return;
  }

  container.innerHTML = products.map(product => `
    <article class="product-card" data-id="${product.id}">
      <img src="${product.image}" alt="${product.title}" draggable="false">
      <h3>${product.title}</h3>
      <p class="description" style="font-size: 13px; color: #aaa; margin: 6px 0;">${product.description}</p>
      <p class="price" style="color: #c19a5b; font-weight: bold;">${product.price} грн / год</p>
      <button class="btn btn-buy" data-id="${product.id}">Купити тренування</button>
    </article>
  `).join('');
}

function updateCartSummary() {
  const totalItems = cart.reduce((total, item) => total + item.quantity, 0);
  const subtotalSum = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const cartBadge = document.getElementById('cartCountBadge') || document.getElementById('num');
  const cartPriceElement = document.getElementById('cartTotalPrice') || document.getElementById('total');

  if (cartBadge) cartBadge.textContent = totalItems;
  if (cartPriceElement) cartPriceElement.textContent = `${subtotalSum}`;

  renderCartModalItems();
  updateLiveSummaryCalculation();
  return subtotalSum;
}

function addToCart(id) {
  const hero = allProducts.find(item => item.id === id);
  if (!hero) return;

  const existingItem = cart.find(item => item.id === id);
  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    cart.push({
      id: hero.id,
      title: hero.title,
      price: hero.price,
      quantity: 1
    });
  }

  saveCartToStorage();
  updateCartSummary();
}

function renderCartModalItems() {
  const container = document.getElementById('cartItemsContainer');
  if (!container) return;

  if (cart.length === 0) {
    container.innerHTML = '<p style="color: #aaa;">Кошик порожній</p>';
    return;
  }

  container.innerHTML = cart.map((item, index) => `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px solid #333; padding-bottom: 5px;">
      <span>${item.title} x${item.quantity} — ${item.price * item.quantity} грн</span>
      <button class="remove-item-btn" data-index="${index}" style="background: #c0392b; color: white; border: none; padding: 2px 8px; cursor: pointer; border-radius: 4px;">✕</button>
    </div>
  `).join('');
}

function setupLivePromoListener() {
  const promoInput = document.getElementById('orderPromo');
  if (!promoInput) return;

  promoInput.addEventListener('input', () => {
    updateLiveSummaryCalculation();
    saveOrderFormDraft();
  });
}

function updateLiveSummaryCalculation() {
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const promoInput = document.getElementById('orderPromo');
  const promoValue = promoInput ? promoInput.value.trim().toUpperCase() : '';

  let discountPercent = 0;
  if (promoValue === 'SALE10') {
    discountPercent = 10;
  }

  const discountAmount = Math.round(subtotal * (discountPercent / 100));
  const finalAmount = Math.max(0, subtotal - discountAmount);

  const subtotalEl = document.getElementById('summarySubtotal');
  const discountEl = document.getElementById('summaryDiscount');
  const totalEl = document.getElementById('summaryTotal');

  if (subtotalEl) subtotalEl.textContent = `${subtotal} грн`;
  if (discountEl) discountEl.textContent = `-${discountAmount} грн`;
  if (totalEl) totalEl.textContent = `${finalAmount} грн`;
}

function saveOrderFormDraft() {
  const orderForm = document.getElementById('checkoutOrderForm');
  if (!orderForm) return;

  const draftData = {
    clientName: document.getElementById('clientName')?.value || '',
    clientPhone: document.getElementById('clientPhone')?.value || '',
    clientEmail: document.getElementById('clientEmail')?.value || '',
    orderPromo: document.getElementById('orderPromo')?.value || ''
  };

  sessionStorage.setItem(DRAFT_ORDER_KEY, JSON.stringify(draftData));
}

function restoreOrderFormDraft() {
  const rawDraft = sessionStorage.getItem(DRAFT_ORDER_KEY);
  if (!rawDraft) return;

  try {
    const draft = JSON.parse(rawDraft);
    if (draft.clientName) document.getElementById('clientName').value = draft.clientName;
    if (draft.clientPhone) document.getElementById('clientPhone').value = draft.clientPhone;
    if (draft.clientEmail) document.getElementById('clientEmail').value = draft.clientEmail;
    if (draft.orderPromo) {
      document.getElementById('orderPromo').value = draft.orderPromo;
      updateLiveSummaryCalculation();
    }
  } catch (e) {
    console.error('Помилка відновлення чернетки', e);
  }
}

function setupCheckoutForm() {
  const orderForm = document.getElementById('checkoutOrderForm');
  if (!orderForm) return;

  const inputs = orderForm.querySelectorAll('input');
  inputs.forEach(input => {
    input.addEventListener('input', () => {
      saveOrderFormDraft();
    });
  });

  orderForm.addEventListener('submit', (event) => {
    event.preventDefault();

    const formData = new FormData(orderForm);

    const rawName = formData.get('clientName') || '';
    const rawPhone = formData.get('clientPhone') || '';
    const rawEmail = formData.get('clientEmail') || '';
    const rawPromo = formData.get('orderPromo') || '';

    const cleanName = rawName.trim().replace(/\s+/g, ' ');
    const cleanPhone = rawPhone.replaceAll(/[\s\(\)\-]/g, '');
    const cleanEmail = rawEmail.trim().toLowerCase();
    const cleanPromo = rawPromo.trim().toUpperCase();

    const isFormValid = validateCheckoutForm(cleanName, cleanPhone, cleanEmail);
    if (!isFormValid) return;

    completeCheckoutProcess(cleanName, cleanPhone, cleanEmail, cleanPromo);
  });
}

function validateCheckoutForm(name, phone, email) {
  let isValid = true;

  document.getElementById('nameError').textContent = '';
  document.getElementById('phoneError').textContent = '';
  document.getElementById('emailError').textContent = '';

  const words = name.split(' ').filter(Boolean);
  if (words.length < 2 || name.length < 5) {
    document.getElementById('nameError').textContent = "Введіть повне ім'я та прізвище (щонайменше 2 слова).";
    isValid = false;
  }

  const phonePattern = /^\+?380\d{9}$/;
  if (!phonePattern.test(phone)) {
    document.getElementById('phoneError').textContent = "Введіть коректний номер у форматі +380XXXXXXXXX.";
    isValid = false;
  }

  const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailPattern.test(email)) {
    document.getElementById('emailError').textContent = "Введіть дійсну поштову адресу (наприклад, user@mail.com).";
    isValid = false;
  }

  return isValid;
}

function completeCheckoutProcess(name, phone, email, promo) {
  if (cart.length === 0) {
    alert("Ваш кошик порожній! Спочатку оберіть тренування.");
    return;
  }

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  let discountPercent = 0;
  if (promo === 'SALE10') {
    discountPercent = 10;
  }

  const discountAmount = Math.round(subtotal * (discountPercent / 100));
  const finalAmount = Math.max(0, subtotal - discountAmount);

  const orderData = {
    customer: { name, phone, email },
    items: cart.map(item => ({
      id: item.id,
      title: item.title,
      quantity: item.quantity,
      price: item.price,
      cost: Number((item.price * item.quantity).toFixed(2))
    })),
    promoCode: promo || null,
    discountAmount,
    totalToPay: Number(finalAmount.toFixed(2)),
    createdAt: new Date().toISOString()
  };

  console.log("Замовлення сформовано (JSON Payload):", orderData);
  alert(`Дякуємо, ${name}! Ваше тренування куплено. Чекайте тренера для зв'язку.`);

  cart = [];
  saveCartToStorage();
  updateCartSummary();
  
  const orderForm = document.getElementById('checkoutOrderForm');
  if (orderForm) orderForm.reset();
  sessionStorage.removeItem(DRAFT_ORDER_KEY);
  updateLiveSummaryCalculation();
}

function setupStorageSync() {
  window.addEventListener('storage', (event) => {
    if (event.key === CART_STORAGE_KEY) {
      cart = loadCartFromStorage();
      updateCartSummary();
    }
    if (event.key === THEME_STORAGE_KEY) {
      applyTheme(event.newValue || 'dark');
    }
  });
}