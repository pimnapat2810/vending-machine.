// =====================================================
//  database.js - ฐานข้อมูลของตู้กดเครื่องเขียน
//  เก็บข้อมูลไว้ใน localStorage ของเบราว์เซอร์
//  (ปิดหน้าเว็บแล้วเปิดใหม่ สต็อกและยอดขายยังอยู่)
// =====================================================

// ---------- ชื่อ key ที่ใช้เก็บข้อมูล ----------
const DB_KEY_PRODUCTS = "stationery_vending_products";
const DB_KEY_SALES = "stationery_vending_sales";

// ---------- จำนวนสต็อก ----------
const DEFAULT_STOCK = 5;   // สต็อกเริ่มต้นของแต่ละช่อง
const MAX_STOCK = 10;      // แต่ละช่องใส่ได้สูงสุด 10 ชิ้น

// ---------- ข้อมูลสินค้าเริ่มต้น 15 อย่าง ----------
// code  = รหัสช่อง (แถว A B C / ช่อง 1-5)
// price = ราคา (บาท)
const DEFAULT_PRODUCTS = [
  { code: "A1", name: "ดินสอ 2B",        emoji: "✏️", price: 6,  stock: DEFAULT_STOCK },
  { code: "A2", name: "ปากกาลูกลื่น",     emoji: "🖊️", price: 10, stock: DEFAULT_STOCK },
  { code: "A3", name: "ปากกาหมึกซึม",     emoji: "🖋️", price: 45, stock: DEFAULT_STOCK },
  { code: "A4", name: "สีเทียน",          emoji: "🖍️", price: 35, stock: DEFAULT_STOCK },
  { code: "A5", name: "พู่กัน",            emoji: "🖌️", price: 25, stock: DEFAULT_STOCK },

  { code: "B1", name: "ไม้บรรทัด",         emoji: "📏", price: 12, stock: DEFAULT_STOCK },
  { code: "B2", name: "ไม้ฉาก",           emoji: "📐", price: 20, stock: DEFAULT_STOCK },
  { code: "B3", name: "กรรไกร",           emoji: "✂️", price: 30, stock: DEFAULT_STOCK },
  { code: "B4", name: "คลิปหนีบกระดาษ",    emoji: "📎", price: 8,  stock: DEFAULT_STOCK },
  { code: "B5", name: "หมุดปักบอร์ด",      emoji: "📌", price: 15, stock: DEFAULT_STOCK },

  { code: "C1", name: "สมุดโน้ต",          emoji: "📓", price: 20, stock: DEFAULT_STOCK },
  { code: "C2", name: "สมุดริมลวด",        emoji: "🗒️", price: 25, stock: DEFAULT_STOCK },
  { code: "C3", name: "สติกเกอร์ชื่อ",      emoji: "🏷️", price: 10, stock: DEFAULT_STOCK },
  { code: "C4", name: "เข็มกลัด",          emoji: "🧷", price: 5,  stock: DEFAULT_STOCK },
  { code: "C5", name: "ซองจดหมาย",        emoji: "✉️", price: 3,  stock: DEFAULT_STOCK }
];


// =====================================================
//  ส่วนสินค้า (products)
// =====================================================

// คัดลอกสินค้าเริ่มต้นออกมาเป็นชุดใหม่
// (ไม่แก้ DEFAULT_PRODUCTS ตัวจริง เผื่อใช้รีเซ็ต)
function copyDefaultProducts() {
  let list = [];
  for (let i = 0; i < DEFAULT_PRODUCTS.length; i++) {
    let p = DEFAULT_PRODUCTS[i];
    list.push({
      code: p.code,
      name: p.name,
      emoji: p.emoji,
      price: p.price,
      stock: p.stock
    });
  }
  return list;
}

// โหลดสินค้าทั้งหมด ถ้ายังไม่เคยบันทึก ให้ใช้ค่าเริ่มต้น
function dbLoadProducts() {
  try {
    const text = localStorage.getItem(DB_KEY_PRODUCTS);
    if (text === null) {
      return copyDefaultProducts();
    }
    return JSON.parse(text);
  } catch (error) {
    console.log("โหลดสินค้าไม่ได้ ใช้ค่าเริ่มต้นแทน", error);
    return copyDefaultProducts();
  }
}

// บันทึกสินค้าทั้งหมด (เรียกทุกครั้งที่สต็อกเปลี่ยน)
function dbSaveProducts(products) {
  try {
    localStorage.setItem(DB_KEY_PRODUCTS, JSON.stringify(products));
  } catch (error) {
    console.log("บันทึกสินค้าไม่ได้", error);
  }
}

// หาสินค้าจากรหัส เช่น "B3" ถ้าไม่เจอคืนค่า null
function dbFindProduct(products, code) {
  for (let i = 0; i < products.length; i++) {
    if (products[i].code === code) {
      return products[i];
    }
  }
  return null;
}

// รีเซ็ตสินค้ากลับเป็นค่าเริ่มต้น
function dbResetProducts() {
  const fresh = copyDefaultProducts();
  dbSaveProducts(fresh);
  return fresh;
}


// =====================================================
//  ส่วนประวัติการขาย (sales)
// =====================================================

// โหลดประวัติการขายทั้งหมด
function dbLoadSales() {
  try {
    const text = localStorage.getItem(DB_KEY_SALES);
    if (text === null) {
      return [];
    }
    return JSON.parse(text);
  } catch (error) {
    console.log("โหลดประวัติการขายไม่ได้", error);
    return [];
  }
}

// บันทึกประวัติการขายทั้งหมด
function dbSaveSales(sales) {
  try {
    localStorage.setItem(DB_KEY_SALES, JSON.stringify(sales));
  } catch (error) {
    console.log("บันทึกประวัติการขายไม่ได้", error);
  }
}

// เพิ่มรายการขาย 1 รายการ
// method = "เงินสด" หรือ "สแกน QR"
function dbAddSale(product, method, paid, change) {
  let sales = dbLoadSales();
  const now = new Date();

  sales.push({
    time: now.toLocaleString("th-TH"),
    code: product.code,
    name: product.name,
    price: product.price,
    method: method,
    paid: paid,
    change: change
  });

  dbSaveSales(sales);
}

// ล้างประวัติการขาย
function dbClearSales() {
  dbSaveSales([]);
}