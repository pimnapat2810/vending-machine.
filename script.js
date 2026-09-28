// =====================================================
//  script.js - การทำงานของตู้กดเครื่องเขียน
//  ต้องโหลดหลัง database.js
// =====================================================


// =====================================================
//  1) ค่าคงที่
// =====================================================
const MAX_CREDIT = 500;          // ตู้รับเงินสูงสุด 500 บาทต่อครั้ง
const QR_TIME_LIMIT = 60;        // เวลาในการสแกนจ่าย (วินาที)
const MONEY_TYPES = [100, 50, 20, 10, 5, 2, 1];  // ใช้ทอนเงิน เรียงจากมากไปน้อย


// =====================================================
//  2) ตัวแปรสถานะของตู้
// =====================================================
let products = dbLoadProducts();  // สินค้าทั้งหมด (โหลดจากฐานข้อมูล)
let typedCode = "";               // รหัสที่กำลังกด เช่น "B"
let selectedProduct = null;       // สินค้าที่เลือกอยู่
let credit = 0;                   // เงินที่หยอดแล้ว
let isBusy = false;               // true = กำลังปล่อยของ ห้ามกดอย่างอื่น

let qrProduct = null;             // สินค้าที่กำลังจ่ายด้วย QR
let qrTimerId = null;
let qrSecondsLeft = 0;

let toastTimerId = null;


// =====================================================
//  3) ดึง element จากหน้าเว็บ
// =====================================================
const shelf = document.getElementById("shelf");
const machineLeft = document.getElementById("machineLeft");
const tray = document.getElementById("tray");
const trayItems = document.getElementById("trayItems");

const displayLine1 = document.getElementById("displayLine1");
const displayLine2 = document.getElementById("displayLine2");
const creditAmount = document.getElementById("creditAmount");
const coinSlot = document.getElementById("coinSlot");
const changeCup = document.getElementById("changeCup");
const changeItems = document.getElementById("changeItems");

const qrModal = document.getElementById("qrModal");
const qrItemText = document.getElementById("qrItemText");
const qrCanvas = document.getElementById("qrCanvas");
const qrAmount = document.getElementById("qrAmount");
const qrTimer = document.getElementById("qrTimer");

const stockTable = document.getElementById("stockTable");
const salesList = document.getElementById("salesList");
const salesCount = document.getElementById("salesCount");
const salesTotal = document.getElementById("salesTotal");

const toast = document.getElementById("toast");


// =====================================================
//  4) ฟังก์ชันช่วยแสดงผล
// =====================================================

// เขียนข้อความลงจอ LED 2 บรรทัด
function showDisplay(line1, line2) {
  displayLine1.textContent = line1;
  displayLine2.textContent = line2;
}

// อัปเดตยอดเงินที่หยอด
function updateCredit() {
  creditAmount.textContent = credit;
}

// ข้อความเด้งด้านล่างจอ
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(toastTimerId);
  toastTimerId = setTimeout(function () {
    toast.classList.remove("show");
  }, 2200);
}


// =====================================================
//  5) สร้างช่องสินค้า 15 ช่องในตู้
// =====================================================
function renderShelf() {
  shelf.innerHTML = "";

  for (let i = 0; i < products.length; i++) {
    const p = products[i];

    const slot = document.createElement("button");
    slot.type = "button";
    slot.className = "slot";
    slot.id = "slot-" + p.code;
    slot.setAttribute("aria-label", p.code + " " + p.name + " ราคา " + p.price + " บาท");

    if (p.stock <= 0) {
      slot.classList.add("sold-out");
    }

    let stockText = "เหลือ " + p.stock;
    if (p.stock <= 0) {
      stockText = "หมด";
    }

    slot.innerHTML =
      '<span class="slot-item">' + p.emoji + '</span>' +
      '<span class="coil"></span>' +
      '<span class="slot-label">' + p.code + ' | ' + p.price + ' ฿</span>' +
      '<span class="slot-name">' + p.name + '</span>' +
      '<span class="slot-stock">' + stockText + '</span>';

    slot.addEventListener("click", function () {
      selectProduct(p.code);
    });

    shelf.appendChild(slot);
  }

  markSelectedSlot();
}

// ใส่กรอบสีชมพูที่ช่องที่เลือก
function markSelectedSlot() {
  const allSlots = document.querySelectorAll(".slot");
  for (let i = 0; i < allSlots.length; i++) {
    allSlots[i].classList.remove("selected");
  }

  if (selectedProduct !== null) {
    const slot = document.getElementById("slot-" + selectedProduct.code);
    if (slot !== null) {
      slot.classList.add("selected");
    }
  }
}


// =====================================================
//  6) แป้นกดรหัส และการเลือกสินค้า
// =====================================================
function pressKey(key) {
  if (isBusy) {
    return;
  }

  // ปุ่มลบ = ล้างรหัสและยกเลิกสินค้าที่เลือก
  if (key === "ลบ") {
    typedCode = "";
    selectedProduct = null;
    markSelectedSlot();
    showDisplay("กดรหัสสินค้า", "หรือแตะที่สินค้าในตู้");
    return;
  }

  // ปุ่มตัวอักษร A B C = เลือกแถว
  const isLetter = (key === "A" || key === "B" || key === "C");
  if (isLetter) {
    typedCode = key;
    showDisplay("รหัส: " + typedCode + "_", "กดตัวเลข 1-5");
    return;
  }

  // ปุ่มตัวเลข ต้องกดตัวอักษรก่อน
  if (typedCode.length !== 1) {
    showDisplay("กดตัวอักษรก่อน", "A, B หรือ C แล้วตามด้วยตัวเลข");
    return;
  }

  typedCode = typedCode + key;   // เช่น "B" + "3" = "B3"
  selectProduct(typedCode);
}

function selectProduct(code) {
  if (isBusy) {
    return;
  }

  typedCode = "";
  const p = dbFindProduct(products, code);

  if (p === null) {
    showDisplay("ไม่มีรหัส " + code, "ลองกดใหม่อีกครั้ง");
    return;
  }

  selectedProduct = p;
  markSelectedSlot();

  if (p.stock <= 0) {
    showDisplay(p.code + " " + p.name, "สินค้าหมด เลือกชิ้นอื่นได้เลย");
    return;
  }

  showPriceStatus();
}

// บอกราคาและบอกว่าเงินพอหรือยัง
function showPriceStatus() {
  const p = selectedProduct;
  const line1 = p.code + " " + p.name + " " + p.price + " บาท";

  if (credit >= p.price) {
    showDisplay(line1, "เงินพอแล้ว กด ซื้อด้วยเงินที่หยอด");
  } else {
    const missing = p.price - credit;
    showDisplay(line1, "หยอดเพิ่มอีก " + missing + " บาท หรือสแกนจ่าย");
  }
}


// =====================================================
//  7) ระบบหยอดเงิน
// =====================================================
function insertMoney(value) {
  if (isBusy) {
    return;
  }

  if (credit + value > MAX_CREDIT) {
    showDisplay("ตู้รับเงินได้สูงสุด " + MAX_CREDIT + " บาท", "เลือกสินค้าหรือกดคืนเงิน");
    return;
  }

  credit = credit + value;
  updateCredit();

  // ไฟช่องหยอดเหรียญกะพริบ
  coinSlot.classList.add("blink");
  setTimeout(function () {
    coinSlot.classList.remove("blink");
  }, 200);

  if (selectedProduct !== null && selectedProduct.stock > 0) {
    showPriceStatus();
  } else {
    showDisplay("หยอดแล้ว " + credit + " บาท", "เลือกสินค้าได้เลย");
  }
}

// ซื้อด้วยเงินที่หยอด
function buyWithCash() {
  if (isBusy) {
    return;
  }

  if (selectedProduct === null) {
    showDisplay("ยังไม่ได้เลือกสินค้า", "กดรหัสหรือแตะที่สินค้า");
    return;
  }

  if (selectedProduct.stock <= 0) {
    showDisplay("สินค้าหมด", "เลือกชิ้นอื่นได้เลย");
    return;
  }

  if (credit < selectedProduct.price) {
    const missing = selectedProduct.price - credit;
    showDisplay("เงินไม่พอ", "หยอดเพิ่มอีก " + missing + " บาท");
    return;
  }

  const product = selectedProduct;
  const paid = credit;
  const change = paid - product.price;

  credit = 0;
  updateCredit();

  completeSale(product, "เงินสด", paid, change);
}

// คืนเงินที่หยอดค้างไว้
function refundMoney() {
  if (isBusy) {
    return;
  }

  if (credit === 0) {
    showDisplay("ไม่มีเงินค้างในตู้", "หยอดเงินหรือเลือกสินค้าได้เลย");
    return;
  }

  const amount = credit;
  giveChange(amount);
  credit = 0;
  updateCredit();
  showDisplay("คืนเงิน " + amount + " บาท", "รับเงินที่ช่องเงินทอน");
}


// =====================================================
//  8) เงินทอน
// =====================================================

// แตกเงินเป็นเหรียญ/ธนบัตร เช่น 38 -> [20, 10, 5, 2, 1]
function breakMoney(amount) {
  let pieces = [];
  let left = amount;

  for (let i = 0; i < MONEY_TYPES.length; i++) {
    const value = MONEY_TYPES[i];
    while (left >= value) {
      pieces.push(value);
      left = left - value;
    }
  }

  return pieces;
}

// ใส่เงินทอนลงช่อง
function giveChange(amount) {
  const pieces = breakMoney(amount);

  for (let i = 0; i < pieces.length; i++) {
    const value = pieces[i];
    const piece = document.createElement("span");
    piece.textContent = value;

    if (value >= 20) {
      piece.className = "change-note note-" + value;
    } else {
      piece.className = "change-coin";
    }

    changeItems.appendChild(piece);
  }
}

// กดที่ช่องเงินทอนเพื่อเก็บเงิน
function collectChange() {
  const pieces = changeItems.children;
  if (pieces.length === 0) {
    showToast("ช่องเงินทอนว่างอยู่");
    return;
  }

  let total = 0;
  for (let i = 0; i < pieces.length; i++) {
    total = total + Number(pieces[i].textContent);
  }

  changeItems.innerHTML = "";
  showToast("เก็บเงินทอน " + total + " บาทแล้ว");
}


// =====================================================
//  9) ปิดการขาย + ทำให้ของหล่นลงมา
// =====================================================
function completeSale(product, method, paid, change) {
  isBusy = true;

  // ตัดสต็อกและบันทึกลงฐานข้อมูล
  product.stock = product.stock - 1;
  dbSaveProducts(products);
  dbAddSale(product, method, paid, change);

  showDisplay("กำลังปล่อยสินค้า...", product.name);

  dropItem(product, function () {
    // ทำงานหลังของตกถึงช่องแล้ว
    isBusy = false;

    if (change > 0) {
      giveChange(change);
      showDisplay("รับสินค้าที่ช่องด้านล่าง", "เงินทอน " + change + " บาท");
    } else {
      showDisplay("รับสินค้าที่ช่องด้านล่าง", "ขอบคุณที่ใช้บริการ");
    }

    selectedProduct = null;
    renderShelf();
    renderBackroom();
  });
}

// แอนิเมชันของหล่น
function dropItem(product, onDone) {
  const slot = document.getElementById("slot-" + product.code);
  const itemInSlot = slot.querySelector(".slot-item");
  const coil = slot.querySelector(".coil");

  // หาตำแหน่งเทียบกับกล่อง machineLeft
  const areaRect = machineLeft.getBoundingClientRect();
  const itemRect = itemInSlot.getBoundingClientRect();
  const trayRect = tray.getBoundingClientRect();

  const startLeft = itemRect.left - areaRect.left;
  const startTop = itemRect.top - areaRect.top;
  const endTop = trayRect.top - areaRect.top + 40;

  // สร้างของชิ้นที่จะตก วางทับตำแหน่งเดิมในช่อง
  const falling = document.createElement("div");
  falling.className = "falling-item";
  falling.textContent = product.emoji;
  falling.style.left = startLeft + "px";
  falling.style.top = startTop + "px";
  machineLeft.appendChild(falling);

  // ซ่อนของในช่อง ถ้าเป็นชิ้นสุดท้าย
  if (product.stock <= 0) {
    itemInSlot.style.visibility = "hidden";
  }

  // ขั้นที่ 1: ขดลวดหมุน ดันของออกมา
  coil.classList.add("spinning");
  setTimeout(function () {
    falling.classList.add("push-out");
  }, 50);

  // ขั้นที่ 2: ของหล่นลงช่องรับสินค้า
  setTimeout(function () {
    coil.classList.remove("spinning");
    falling.classList.add("fall");
    falling.style.top = endTop + "px";
  }, 900);

  // ขั้นที่ 3: ของถึงช่องแล้ว
  setTimeout(function () {
    falling.remove();
    addItemToTray(product);

    tray.classList.add("bump");
    setTimeout(function () {
      tray.classList.remove("bump");
    }, 300);

    onDone();
  }, 1650);
}

// ใส่ของลงช่องรับสินค้า
function addItemToTray(product) {
  const item = document.createElement("button");
  item.type = "button";
  item.className = "tray-item";
  item.textContent = product.emoji;
  item.setAttribute("aria-label", "หยิบ " + product.name);

  item.addEventListener("click", function () {
    item.remove();
    showToast("หยิบ " + product.name + " แล้ว");
  });

  trayItems.appendChild(item);
}


// =====================================================
//  10) ระบบสแกนจ่าย QR (จำลอง)
// =====================================================
function openQR() {
  if (isBusy) {
    return;
  }

  if (selectedProduct === null) {
    showDisplay("ยังไม่ได้เลือกสินค้า", "เลือกสินค้าก่อนสแกนจ่าย");
    return;
  }

  if (selectedProduct.stock <= 0) {
    showDisplay("สินค้าหมด", "เลือกชิ้นอื่นได้เลย");
    return;
  }

  qrProduct = selectedProduct;
  qrItemText.textContent = qrProduct.code + " " + qrProduct.name;
  qrAmount.textContent = qrProduct.price + " บาท";

  // ใช้เวลาปัจจุบันเป็นส่วนหนึ่งของข้อความ ให้ QR แต่ละครั้งไม่ซ้ำกัน
  drawFakeQR(qrProduct.code + qrProduct.price + Date.now());

  qrModal.hidden = false;
  showDisplay("รอสแกนจ่าย " + qrProduct.price + " บาท", "สแกน QR บนหน้าจอ");
  startQRTimer();
}

function startQRTimer() {
  qrSecondsLeft = QR_TIME_LIMIT;
  qrTimer.textContent = "เหลือเวลา " + qrSecondsLeft + " วินาที";

  clearInterval(qrTimerId);
  qrTimerId = setInterval(function () {
    qrSecondsLeft = qrSecondsLeft - 1;
    qrTimer.textContent = "เหลือเวลา " + qrSecondsLeft + " วินาที";

    if (qrSecondsLeft <= 0) {
      closeQR();
      showDisplay("หมดเวลาชำระเงิน", "กดสแกนจ่ายใหม่อีกครั้ง");
    }
  }, 1000);
}

function closeQR() {
  clearInterval(qrTimerId);
  qrTimerId = null;
  qrModal.hidden = true;
}

// กดยกเลิก
function cancelQR() {
  closeQR();
  qrProduct = null;
  showDisplay("ยกเลิกการสแกนจ่าย", "เลือกวิธีจ่ายใหม่ได้เลย");
}

// จำลองว่าลูกค้าสแกนจ่ายสำเร็จ
function confirmQRPaid() {
  const product = qrProduct;
  closeQR();
  qrProduct = null;

  if (product === null) {
    return;
  }

  showToast("ได้รับเงิน " + product.price + " บาท ผ่าน QR");
  completeSale(product, "สแกน QR", product.price, 0);
}

// วาด QR ปลอมลงบน canvas (ลวดลายสุ่มจากข้อความ + มุมสี่เหลี่ยม 3 มุม)
function drawFakeQR(text) {
  const ctx = qrCanvas.getContext("2d");
  const size = 25;                       // ตาราง 25 x 25 ช่อง
  const cell = qrCanvas.width / size;    // 200 / 25 = 8 px ต่อช่อง
  const dark = "#22324F";

  // พื้นขาว
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, qrCanvas.width, qrCanvas.height);

  // สร้างเลขตั้งต้นจากข้อความ
  let seed = 0;
  for (let i = 0; i < text.length; i++) {
    seed = (seed * 31 + text.charCodeAt(i)) % 233280;
  }

  // สุ่มเติมจุดดำ
  ctx.fillStyle = dark;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (isInCorner(row, col, size)) {
        continue;
      }
      seed = (seed * 9301 + 49297) % 233280;
      if (seed / 233280 > 0.5) {
        ctx.fillRect(col * cell, row * cell, cell, cell);
      }
    }
  }

  // มุมสี่เหลี่ยม 3 มุมแบบ QR จริง
  drawCornerSquare(ctx, 0, 0, cell, dark);
  drawCornerSquare(ctx, size - 7, 0, cell, dark);
  drawCornerSquare(ctx, 0, size - 7, cell, dark);
}

function isInCorner(row, col, size) {
  const topLeft = (row < 8 && col < 8);
  const topRight = (row < 8 && col >= size - 8);
  const bottomLeft = (row >= size - 8 && col < 8);
  return topLeft || topRight || bottomLeft;
}

function drawCornerSquare(ctx, col, row, cell, dark) {
  ctx.fillStyle = dark;
  ctx.fillRect(col * cell, row * cell, 7 * cell, 7 * cell);

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect((col + 1) * cell, (row + 1) * cell, 5 * cell, 5 * cell);

  ctx.fillStyle = dark;
  ctx.fillRect((col + 2) * cell, (row + 2) * cell, 3 * cell, 3 * cell);
}


// =====================================================
//  11) ฐานข้อมูลหลังร้าน (สต็อก + ยอดขาย)
// =====================================================
function renderBackroom() {
  // ----- ตารางสต็อก -----
  stockTable.innerHTML = "";

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const row = document.createElement("tr");

    let stockClass = "";
    if (p.stock <= 1) {
      stockClass = "stock-low";
    }

    row.innerHTML =
      "<td>" + p.code + "</td>" +
      "<td>" + p.emoji + " " + p.name + "</td>" +
      "<td>" + p.price + "</td>" +
      '<td class="' + stockClass + '">' + p.stock + " / " + MAX_STOCK + "</td>" +
      "<td></td>";

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "small-btn";
    addButton.textContent = "+1";
    addButton.setAttribute("aria-label", "เติม " + p.name + " 1 ชิ้น");
    if (p.stock >= MAX_STOCK) {
      addButton.disabled = true;
    }
    addButton.addEventListener("click", function () {
      addStock(p.code);
    });

    row.lastElementChild.appendChild(addButton);
    stockTable.appendChild(row);
  }

  // ----- ประวัติการขาย -----
  const sales = dbLoadSales();
  salesList.innerHTML = "";

  let total = 0;
  for (let i = 0; i < sales.length; i++) {
    total = total + sales[i].price;
  }
  salesCount.textContent = sales.length;
  salesTotal.textContent = total;

  if (sales.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "ยังไม่มีการขาย ลองซื้อสินค้าจากตู้ด้านบน";
    salesList.appendChild(empty);
    return;
  }

  // แสดงรายการล่าสุดไว้บนสุด
  for (let i = sales.length - 1; i >= 0; i--) {
    const s = sales[i];
    const item = document.createElement("li");
    item.innerHTML =
      "<strong>" + s.code + " " + s.name + "</strong> " + s.price + " บาท" +
      '<span class="sale-detail">' + s.time + " จ่ายด้วย" + s.method +
      " (จ่าย " + s.paid + " ทอน " + s.change + ")</span>";
    salesList.appendChild(item);
  }
}

function addStock(code) {
  if (isBusy) {
    showToast("รอให้ตู้ปล่อยสินค้าเสร็จก่อน");
    return;
  }

  const p = dbFindProduct(products, code);
  if (p === null || p.stock >= MAX_STOCK) {
    return;
  }

  p.stock = p.stock + 1;
  dbSaveProducts(products);
  renderShelf();
  renderBackroom();
}

function refillAll() {
  if (isBusy) {
    showToast("รอให้ตู้ปล่อยสินค้าเสร็จก่อน");
    return;
  }

  for (let i = 0; i < products.length; i++) {
    products[i].stock = MAX_STOCK;
  }
  dbSaveProducts(products);
  renderShelf();
  renderBackroom();
  showToast("เติมสต็อกเต็มทุกช่องแล้ว");
}

function clearSalesHistory() {
  if (!confirm("ล้างประวัติการขายทั้งหมด?")) {
    return;
  }
  dbClearSales();
  renderBackroom();
  showToast("ล้างประวัติการขายแล้ว");
}

function resetDatabase() {
  if (isBusy) {
    showToast("รอให้ตู้ปล่อยสินค้าเสร็จก่อน");
    return;
  }
  if (!confirm("รีเซ็ตสต็อกและลบประวัติการขายทั้งหมด?")) {
    return;
  }

  products = dbResetProducts();
  dbClearSales();
  selectedProduct = null;
  renderShelf();
  renderBackroom();
  showDisplay("รีเซ็ตฐานข้อมูลแล้ว", "กดรหัสสินค้าเพื่อเริ่มใหม่");
}


// =====================================================
//  12) ผูกปุ่มต่าง ๆ กับฟังก์ชัน
// =====================================================
function setupButtons() {
  // แป้นกดรหัส
  const keys = document.querySelectorAll(".key");
  for (let i = 0; i < keys.length; i++) {
    const button = keys[i];
    button.addEventListener("click", function () {
      pressKey(button.dataset.key);
    });
  }

  // เหรียญและธนบัตร
  const moneyButtons = document.querySelectorAll(".coin, .note");
  for (let i = 0; i < moneyButtons.length; i++) {
    const button = moneyButtons[i];
    button.addEventListener("click", function () {
      insertMoney(Number(button.dataset.value));
    });
  }

  // ปุ่มหลัก
  document.getElementById("btnBuyCash").addEventListener("click", buyWithCash);
  document.getElementById("btnQR").addEventListener("click", openQR);
  document.getElementById("btnRefund").addEventListener("click", refundMoney);
  changeCup.addEventListener("click", collectChange);

  // หน้าต่าง QR
  document.getElementById("btnQRPaid").addEventListener("click", confirmQRPaid);
  document.getElementById("btnQRCancel").addEventListener("click", cancelQR);

  // หลังร้าน
  document.getElementById("btnRefillAll").addEventListener("click", refillAll);
  document.getElementById("btnClearSales").addEventListener("click", clearSalesHistory);
  document.getElementById("btnResetDb").addEventListener("click", resetDatabase);

  // กดจากคีย์บอร์ดได้ด้วย: A B C, 1-5, Backspace = ลบ
  document.addEventListener("keydown", function (event) {
    // ถ้าหน้าต่าง QR เปิดอยู่ ใช้ได้แค่ Esc
    if (!qrModal.hidden) {
      if (event.key === "Escape") {
        cancelQR();
      }
      return;
    }

    const key = event.key.toUpperCase();

    if (key === "A" || key === "B" || key === "C") {
      pressKey(key);
    } else if (key === "1" || key === "2" || key === "3" || key === "4" || key === "5") {
      pressKey(key);
    } else if (key === "BACKSPACE") {
      pressKey("ลบ");
    }
  });
}


// =====================================================
//  13) เริ่มทำงาน
// =====================================================
setupButtons();
renderShelf();
renderBackroom();
updateCredit();
showDisplay("กดรหัสสินค้า", "หรือแตะที่สินค้าในตู้");