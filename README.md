# UM+ · ช่วยเหลือฉุกเฉิน

เว็บแจ้งจุดขอความช่วยเหลือน้ำท่วม กรุงเทพฯ พร้อมหน้าหลังบ้านสำหรับทีมอาสาและแอดมิน
เป็นเว็บ static (HTML/CSS/JS ล้วน ไม่ต้อง build) ใช้ Google Apps Script + Google Sheet เป็นฐานข้อมูล

ย้ายมาจาก branch `gh-pages` ของ [`been6505/ummatee`](https://github.com/been6505/ummatee) (commit `f2351e9`) พร้อมประวัติ commit ทั้งหมด

## หน้าต่างๆ

| ไฟล์ | หน้าที่ |
|---|---|
| `index.html` | หน้าสาธารณะ: แจ้งขอความช่วยเหลือ, ติดตามเคสของตัวเอง, เบอร์ฉุกเฉิน |
| `admin.html` | หลังบ้าน: เข้าด้วยรหัสทีม, รายการเคส, ตรวจสอบพื้นที่, ถุงยังชีพ |
| `admin/dashboard/` | แดชบอร์ดสรุปเคส |
| `admin/teams/` | จัดทีม, สถานะ, ตำแหน่งสด, มอบหมายเคส |
| `admin/stock/` | สต็อกของบริจาค |

## ลองบนเครื่อง

```sh
python3 -m http.server 8000
# เปิด http://localhost:8000/
```

## ขึ้นเว็บด้วย GitHub Pages

Settings → Pages → Source: *Deploy from a branch* → เลือก branch ที่มีโค้ดนี้ (เช่น `main`) โฟลเดอร์ `/ (root)`
เว็บจะอยู่ที่ `https://been6505.github.io/umplus/` (ทุก path ในโค้ดเป็น relative จึงใช้ได้ทันที)

## หมายเหตุ

- ทุกหน้าเรียก Apps Script ตัวเดียวกัน (`API_URL` ใน `script.js`, `admin.js`, `admin/common.js`, `admin/dashboard/dashboard.js`) ถ้าเปลี่ยน URL ต้องแก้ทั้ง 4 ไฟล์
- เมื่อแก้ไฟล์หน้าเว็บ ให้เพิ่มเลขใน `version.json` และ `CACHE` ใน `sw.js` เพื่อให้มือถือที่เปิดค้างไว้โหลดเวอร์ชันใหม่
