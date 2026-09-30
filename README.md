# Simulasi 3D Simpang Setiabudi – Jl. Perkasa (Kawasan Kampus UPI)
### Interactive 3D Urban Traffic Simulation with Three.js & HTML5/Vanilla JavaScript

A complete, high-performance (60 FPS optimized) 3D traffic simulation web application modeling the real-world **Jl. Dr. Setiabudi – Jl. Perkasa T-Junction** (West Campus Access to Universitas Pendidikan Indonesia - UPI) in Bandung, West Java.

---

## 📊 Kalibrasi Data Survei Lalu Lintas (Empirical Volume Data)
- **Volume Jam Puncak Koridor**: **6.800 Kendaraan / Jam**
  - **Sepeda Motor**: **5.000 unit / jam (73.53%)**
  - **Mobil Pribadi, SUV & Angkot**: **1.800 unit / jam (26.47%)**
- **Analisis Kapasitas Jalan (MKJI - Manual Kapasitas Jalan Indonesia)**:
  - Nilai Ekivalen Mobil Penumpang ($emp$): Motor = 0.40, Mobil = 1.00
  - Volume Arus: $Q = (5.000 \times 0.40) + (1.800 \times 1.00) = 3.800\text{ smp/jam}$
  - Kapasitas Dasar Koridor 4 Lajur (4/2 D): $C \approx 5.800\text{ smp/jam}$
  - Derajat Kejenuhan ($DS$): $\frac{Q}{C} = \frac{3.800}{5.800} \approx \mathbf{0.66}$
  - **Tingkat Pelayanan (Level of Service)**: **LOS C (Ramai Lancar • Arus Stabil)**

---

## 🏛️ Penataan Wilayah Kawasan Kampus UPI (Jl. Perkasa)
1. **Gerbang Utama / Gapura Kawasan Kampus UPI**:
   - Gapura megah berwarna merah marun (*UPI Maroon*) & emas melintangi Jl. Perkasa selebar 14.5m dengan tulisan:
     `UNIVERSITAS PENDIDIKAN INDONESIA - KAMPUS BUMI SILIWANGI • AKSES JL. PERKASA`.
2. **Pos Keamanan & Barrier Gate**:
   - Pos Satpam UPI di mulut Jl. Perkasa lengkap dengan jendela kaca, plang resmi, dan palang pintu otomatis.
3. **Kompleks Fasilitas Akademik & Asrama UPI**:
   - **Gedung FPMIPA (Fakultas Pendidikan Matematika dan Ilmu Pengetahuan Alam)** & Laboratorium Kuliah Bersama UPI di sisi utara Jl. Perkasa.
   - **Asrama Mahasiswa Bumi Siliwangi** & Pusat Kegiatan Mahasiswa (PKM UPI) di sisi selatan.
   - Siluet landmark cagar budaya bersejarah **Gedung Villa Isola UPI** di latar belakang kampus sebelah barat daya.
4. **Rambu Petunjuk Arah Jalan (Green Gantry Signboards)**:
   - `⬅ KAWASAN KAMPUS UPI (ASRAMA & FAKULTAS)`
   - `⬆ TERMINAL LEDENG / LEMBANG`
   - `⬇ KAMPUS UTAMA UPI / PUSAT KOTA BANDUNG`
5. **Penyeberang Mahasiswa UPI**:
   - Pejalan kaki zebra cross dimodelkan sebagai mahasiswa UPI lengkap dengan jaket almamater marun dan ransel kuliah.

---

## ⚡ Optimalisasi Kinerja (Lag Fixes & 60 FPS Engine)
1. **Eliminasi Bottleneck Light Buffer**:
   - Mengganti alokasi ratusan `THREE.SpotLight` & `THREE.PointLight` per kendaraan/lampu jalan dengan:
     - Emissive material shaders untuk lampu utama dan rem.
     - **Projected Ground Beam Quad** (tekstur sorot cahaya aditif pada aspal) yang menghasilkan efek sorot malam realistis dengan **0 overhead pencahayaan**.
     - Iluminasi malam terpusat (2 soft point lights) yang menerangi seluruh persimpangan tanpa membebani GPU.
2. **Contact Ambient Occlusion Shadow Plane**:
   - Menggunakan bayangan kontak bawah kendaraan (*under-car shadow quad*) untuk bayangan roda yang tajam dan instan tanpa komputasi shadow map berat.
3. **Shared Geometry Buffer Caching**:
   - Reusable geometry buffer untuk bodi kendaraan, roda, dan komponen lingkungan mencegah alokasi memori berlebih dan *Garbage Collection stutters*.
4. **Tone Mapping & Pixel Ratio Capping**:
   - `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))` menjaga resolusi retina tetap tajam dengan separuh beban fillrate GPU.

---

## 🎥 5 Mode Kamera (Toggleable via HUD)
1. 🚁 **Drone View**: Sudut pandang isometrik cinematic dari ketinggian dengan *hovering sway*.
2. 🌐 **Free Orbit**: Kontrol 360° penuh dengan *damping* (zoom, pan, rotasi).
3. 🏎️ **Chase Cam**: Kamera kejar orang ketiga dinamis yang melacak kendaraan terpilih secara *real-time*.
4. 🚶 **Zebra Cross View**: Sudut pandang pejalan kaki sejajar mata di trotoar penyeberangan zebra cross.
5. 🏛️ **Gerbang UPI View**: Sudut pandang langsung menghadap gapura megah Kawasan Kampus UPI dan Pos Satpam di Jl. Perkasa.

---

## 🌿 Fitur Lingkungan & Lalu Lintas Lanjutan
1. **Sistem Terintegrasi Simpang 3 Sersan Bajuri & Green Wave Corridor**:
   - Lampu lalu lintas 3 fase di Simpang 3 Sersan Bajuri – Terusan Setiabudi.
   - **Green Wave Progression (Gelombang Hijau)**: Saat lampu Setiabudi arah bawah berubah hijau, sistem mengunci tombol penyeberangan zebra cross Jl. Perkasa selama 14 detik agar kendaraan yang baru terlepas dari lampu merah tidak terkena *double red light*.
2. **Pagar Pengaman Trotoar 1.8m & Tanaman Rambat Hedera Helix**:
   - Pagar baja setinggi 1.8m dipasang di sepanjang sisi jalan pada trotoar Barat dan Timur.
   - Tanaman rambat *Hedera Helix* (English Ivy) lebat dengan ribuan helai daun bertingkat dan sulur merambat, serta dedaunan 3D instanced yang menjuntai melengkung di atas pagar.
   - Bukaan bersih disediakan di Zebra Cross Jl. Perkasa dan mulut persimpangan jalan.
3. **Pejalan Kaki Animasi di Trotoar**:
   - Warga dan mahasiswa UPI berjas almamater biru berlalu-lalang di sepanjang trotoar Jl. Setiabudi dan akses Jl. Perkasa.
   - Animasi langkah kaki, ayunan lengan, dan gerak langkah dinamis berbasis delta-time.

---

## 🚀 Menjalankan Aplikasi
```bash
# Direktori proyek:
cd C:\Users\hamdi\.gemini\antigravity-ide\scratch\simulasi-3d-setiabudi-perkasa

# Menjalankan server lokal:
npm run dev

# Akses melalui peramban:
# http://localhost:5175/
```
