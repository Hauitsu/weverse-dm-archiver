# Weverse DM Archiver (UNIS Exclusive)

[English](README.md) · [한국어](README.ko.md) · Bahasa Indonesia

> **Masih pakai salinan lama? Login di situ bisa tidak lengket.** Di semua rilis sampai v1.5.0 jendela
> login ditutup begitu mendadak sehingga browser belum sempat menulis cookie baru ke disk, jadi jendela yang
> membaca pesanmu bisa terbuka dalam keadaan logout walau kamu sudah login - dan Weverse hanya mengizinkan login
> di jendela satunya. Sudah diperbaiki di **v1.7.0**, versi yang diberikan halaman ini. Kalau Weverse menampilkan
> banner cookie, menerimanya adalah cara paling pasti.

![Weverse DM Archiver - DM Weverse-mu, disimpan sebagai halaman yang bisa dibuka offline](assets/01-hero.svg)

DM Weverse-mu hanya hidup di aplikasi dan tidak di tempat lain. Alat ini menyimpannya ke komputer
milikmu sendiri sebagai halaman yang bisa kamu buka kapan saja: offline, di browser apa pun, lengkap
dengan setiap pesan, foto, video dan voice note, dan percakapannya tetap dalam urutan aslinya.

Tidak ada yang diunggah ke mana pun, dan tidak ada akun yang perlu dibuat. Saat satu proses selesai,
kamu memegang berkas biasa di diskmu sendiri - simpan, salin ke drive lain, atau hapus kapan pun
kamu mau.

> **Siap pakai.** Unzip saja - Node.js dan ffmpeg sudah ada di dalamnya - lalu klik dua kali `START.bat`,
> pilih room yang mau diarsipkan, tekan **Start**, login di jendela yang terbuka dan tekan **I'm logged in - continue**.
> Satu room nyata sudah pernah melewatinya:
> 9.574 pesan unik sepanjang 18 bulan, 4.119 di antaranya dari sisi artis, 1.478 berkas media
> (1.444 foto, 30 video, 4 audio), sekitar 2,5 GB.

## Isi yang kamu dapat

![Sekali jalan menghasilkan halaman privat, halaman publik, berkas media dan zip untuk dibagikan](assets/03-what-you-get.svg)

Satu room masuk, satu halaman keluar - plus beberapa tambahan:

- **Halaman berisi seluruh percakapan.** Pesanmu dan pesan artis, berurutan, dengan foto, video dan
  voice note di posisi aslinya, dan waktunya dalam zona waktumu sendiri. Satu berkas per room: klik
  dua kali dan halaman itu terbuka di browser, tanpa perlu internet.
- **Salinan kedua yang bisa dibagikan.** Hanya sisi artis, dan nickname-mu diganti, jadi aman
  diberikan ke orang lain.
- **Zip seluruh room**, kalau kamu lebih suka mengirim satu berkas daripada satu folder - di dalamnya
  ada `README.txt` singkat dalam tiga bahasa untuk penerimanya.
- **Versi teks dan versi data** dari percakapan yang sama (satu berkas Markdown, satu berkas data per
  room), untuk siapa pun yang lebih suka membaca atau mengolahnya dengan cara lain.

Semuanya mendarat di folder tempat alat ini berada - `rooms/`, `rooms-public/`, `media/`, `share/`.
Profil browser milik alat ini (jendela tempat kamu login) disimpan terpisah di `%LOCALAPPDATA%`, jauh
dari browser normalmu.

## Pratinjau DM yang Diarsipkan

Satu room yang sudah selesai terlihat seperti ini - satu berkas HTML yang kamu buka dari diskmu
sendiri, tanpa internet dan tanpa akun Weverse:

![Halaman arsip dengan tema terang](assets/preview-light.png)

![Halaman arsip yang sama dengan tema gelap](assets/preview-dark.png)

## Mulai cepat

![Empat langkah: klik dua kali START.bat, pilih room, tekan Start, login, buka DM](assets/02-how-it-works.svg)

Lima langkah singkat, dan tidak ada yang perlu di-install: **Node.js dan ffmpeg sudah ada di dalam
unduhannya**.

Nama tombol di dokumen ini memakai versi bahasa Inggris. Kalau antarmuka alatnya kamu set ke bahasa
Indonesia, tombolnya berbunyi: **Mulai** (Start), **Stop**, **Buka DM** (Open DM), **Buka folder**
(Open folder), dan **Bagikan** (Share).

### 1. Unduh dan unzip

[Unduh zip-nya](https://github.com/Hauitsu/weverse-dm-archiver/releases/latest/download/weverse-dm-archiver.zip)
lalu unzip ke folder milikmu sendiri, misalnya `D:\weverse-archive`.

Simpan di tempat yang kamu kuasai. Arsipnya ditulis di dalam folder yang sama itu, jadi tempat
seperti `Program Files` akan menolaknya - Desktop, Documents, drive lain atau flashdisk semuanya
aman.

Tidak ada yang lain untuk di-install: zip ini membawa Node.js-nya sendiri. Hanya "salinan source" -
alat yang diambil dari repositori, bukan dari zip ini - yang membutuhkan Node.js terpasang di
komputermu (lihat [Yang kamu butuhkan](#yang-kamu-butuhkan-dan-yang-tidak-akan-dilakukannya)).

### 2. Klik dua kali `START.bat`

Alat ini membuka halamannya sendiri di browser-mu, biasanya `http://127.0.0.1:8787`. Sebuah jendela
console kecil juga terbuka - jendela itu boleh diabaikan.

Kalau alamat itu sedang terpakai, alat ini memilih alamat lain dan jendela console mencetak alamat
yang dipakainya.

### 3. Pilih room untuk diarsipkan dan tekan Start

Sebuah popup singkat mengulang langkah berikutnya. Baca, konfirmasi, dan jendela berikutnya terbuka.

### 4. Login di sana

Jendela browser terpisah terbuka di halaman Weverse yang baru. Login seperti biasanya, dan biarkan
jendela itu tetap terbuka.

Lalu kembali ke halaman alat ini dan tekan **I'm logged in - continue**. Tombol itu diminta di setiap
proses, bahkan saat kamu masih login dari sebelumnya - sesi yang tersimpan bisa kedaluwarsa, dan
hanya kamu yang bisa melihat apakah jendela itu benar-benar sudah login.

### 5. Tunggu sampai selesai

Riwayat dibaca mundur, halaman demi halaman, mulai dari pesanmu yang paling baru. Satu room penuh
butuh waktu, jadi ini saat yang tepat untuk mengerjakan hal lain.

Saat selesai, ada tiga tombol:

- **Open DM** - baca arsipnya di browser, tanpa perlu internet,
- **Open folder** - lihat berkas-berkas yang sudah ditulis,
- **Share** di baris room itu - bikin zip untuk dikirim ke orang lain.

Berubah pikiran di tengah jalan? Tekan **Stop**, atau tutup saja semuanya. Setiap halaman disimpan
begitu tiba, jadi proses berikutnya melanjutkan dari tempat berhentinya, bukan mulai dari nol.

## Apakah aman? Apa dampaknya ke akunku?

![Ekspor privat menyimpan kedua sisi; ekspor publik hanya sisi artis dan menyembunyikan nickname-mu](assets/05-private-public.svg)

- **Hanya membaca.** Alat ini meminta ke Weverse pesan-pesan yang akunmu memang sudah bisa lihat,
  dengan cara yang sama seperti aplikasinya memintanya. Tidak pernah memposting, menghapus, memberi
  reaksi, atau mengikuti.
- **Sengaja dibikin lambat.** Halaman diambil dengan jeda 1,5-3 detik, satu room pada satu waktu,
  seperti orang menggulir layar. Kalau Weverse menjawab "terlalu banyak permintaan", alat ini
  berhenti daripada memaksa.
- **Memakai jendela browser sendiri.** Jendela itu punya profil sendiri, jadi tab yang sedang kamu
  pakai untuk login tidak pernah dimuat ulang, ditutup, atau dipindahkan. Login-mu dipakai di dalam
  jendela itu dan tidak pernah ditulis ke berkas atau ke log.
- **Tidak ada yang keluar dari komputermu.** Tidak ada unggahan, tidak ada telemetri, tidak ada akun
  milik kami. Arsipnya adalah berkas di diskmu, dan kamu yang menentukan siapa yang menerimanya.
- **Yang kamu bagikan sudah dibersihkan.** Di salinan publik, nickname-mu diganti di semua tempat
  yang dicatat arsip - termasuk kalimat yang artis tulis dengan namamu di dalamnya - dan bookmark
  tidak ditulis sama sekali.

Daftar aturan lengkapnya ada di [Aturan keamanan yang diikuti alat
ini](#aturan-keamanan-yang-diikuti-alat-ini) di bawah.
[`docs/FAQ.md`](docs/FAQ.md) berisi versi jujurnya, termasuk
apa yang harus dilakukan kalau kamu ragu.

## Yang bisa dilakukan halaman itu

![Fitur di setiap halaman room: lompat ke tanggal, terjemahan, hari bersama, opsi pesan, media, tema](assets/07-same-in-every-room.svg)

- **Lompat ke tanggal.** Room nyata panjangnya ribuan pesan, jadi tombol ⋯ di sudut kanan atas
  membuka panel yang tab pertamanya adalah tanggal: pilih bulan dan kamu langsung di sana.
- **Terjemahan.** Saat artis menulis dalam bahasa Korea dan Weverse menampilkan baris bahasa Inggris,
  halaman ini menampilkan keduanya dan kamu memilih modenya: asli + Inggris, asli saja, atau Inggris
  saja.
- **Hari bersama.** Pil yang sama seperti yang aplikasi tampilkan di atas percakapan, dan tetap
  berjalan: buka arsipnya sebulan kemudian dan angkanya bertambah satu bulan.
- **Bookmark.** Beri bintang pada pesan mana pun dan pesan itu muncul di tab kedua panel. Daftarnya
  hidup di browser-mu, bisa diekspor jadi berkas, dan render berikutnya bisa menanamkannya kembali.
- **Opsi pesan.** Salin teks sebuah pesan, salin tanggal dan waktunya, atau ganti mode terjemahan
  untuk seluruh halaman.
- **Foto, video, voice note dan gift.** Klik foto untuk ukuran penuh, dengan prev/next; gift
  menyimpan cover yang aplikasi tampilkan dan terbuka ke isinya; voice note berputar di halaman itu.
- **Tema dan warna bubble.** Terang atau gelap, dan sepuluh warna bubble milik aplikasi untuk sisi
  artis, dipilih dari ikon hati di chip hari.

## Yang kamu butuhkan, dan yang tidak akan dilakukannya

- **Windows 10 atau 11 adalah satu-satunya jalur yang teruji** (`START.bat`, `wdm.bat`). Belum ada
  yang menjalankannya di macOS atau Linux, dan unduhan portable-nya memang khusus Windows: Node.js
  dan ffmpeg di dalamnya adalah `node.exe` dan `ffmpeg.exe`. Modul JavaScript-nya ditulis untuk
  berjalan di mana pun Node berjalan - browser dibuka dengan `open` di macOS dan `xdg-open` di sistem
  lain, sisa proses dibersihkan dengan `pkill` bukan PowerShell, dan folder state jatuh ke
  `~/weverse-dm-archiver` dengan profil browser di `~/AppData/Local/` - tapi di dua sistem itu browser
  tetap hanya dicari di lokasi pemasangan Windows, jadi `browserPath` harus kamu isi sendiri (di Mac:
  `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`), Node.js 20 dan `ffmpeg` kamu
  sediakan dari Homebrew atau distribusi kamu, dan yang dijalankan adalah salinan source. Diharapkan
  jalan di sana; belum diketahui jalan.
- **Tidak ada yang perlu di-install**, dan satu browser Chromium (Chrome, Edge, Brave atau Vivaldi;
  `browserPath` di `config.json` bisa diarahkan ke apa pun yang tidak biasa). Unduhan portable
  membawa Node.js 20 di `runtime\node\` dan ffmpeg di `runtime\ffmpeg\`, dan launcher-nya
  menjalankan salinan itu; hanya salinan source yang membutuhkan Node.js sendiri di `PATH` (atau
  `node.exe` yang ditaruh di `runtime\node\`).
- **Hanya room yang akunmu sendiri sudah bisa baca.** Ini tidak menembus keanggotaan atau paywall
  apa pun.
- **Satu room sekitar 2,5 GB** pada kualitas penuh (baris room terpilih menyebut batas 3 GB sampai
  room itu pernah diarsipkan sekali). Zip untuk dibagikan bisa dibuat dari salinan yang dikompres
  ulang ("Low quality" di popup **Share** sebuah room: 1280px di sisi panjang, video h264, audio
  64 kbps), yang membutuhkan `ffmpeg`: salinan di `runtime\ffmpeg\` dipakai kalau ada, kalau tidak
  yang ada di `PATH`-mu (atau `ffmpegPath` di `config.json`); arsip di disk tetap menyimpan
  aslinya, mana pun yang dipilih.
- **Tidak ada yang diposting, dihapus atau diubah** di Weverse, dan tidak ada pesan yang bisa
  diedit lewat arsip: ini salinan untuk dibaca.

## Pertanyaan yang sering muncul

**Apakah ini berbayar?** Tidak. Ini alat gratis dan open-source (lisensi MIT) tanpa akun, tanpa
langganan, dan tanpa yang perlu didaftarkan.

**Apakah saya perlu paham hal teknis?** Tidak. Unzip unduhannya - Node.js dan ffmpeg sudah ada di
dalamnya - klik dua kali `START.bat`, pilih room yang mau diarsipkan dan tekan Start. Sisanya tombol.

**Apakah kalian dapat password Weverse saya?** Tidak. Kamu mengetiknya di jendela browser yang
dibuka alat ini, seperti di browser biasa. Password itu tidak pernah ditulis ke berkas, tidak pernah
dicatat di log, dan tidak pernah dikirim ke kami - memang tidak ada tempat di kami untuk menerimanya.

**Bagaimana kalau berhenti di tengah, atau jendelanya saya tutup?** Tidak ada yang hilang. Setiap
halaman riwayat disimpan begitu tiba, jadi proses berikutnya melanjutkan dari sana.

**Bisakah arsipnya dipindah ke komputer lain?** Bisa: salin seluruh folder alat ini. Halamannya
berkas HTML biasa, tapi ia menunjuk ke berkas media di sebelahnya, jadi foldernya harus ikut
berpindah.

**Butuh ruang berapa besar?** Sekitar 2,5 GB per room pada kualitas penuh, sebagian besar untuk foto
dan video.

Lebih detail: [`docs/QUICK-START.md`](docs/QUICK-START.md) untuk langkah-langkahnya,
[`docs/FAQ.md`](docs/FAQ.md) untuk jawaban jujurnya, [`docs/ROADMAP.md`](docs/ROADMAP.md) untuk
rencananya. Kedua berkas itu masih berbahasa Inggris. Detail teknisnya dilipat di bagian bawah
berkas ini.

## Bagian teknis

### Cara kerjanya

Alat ini membaca riwayat dengan cara yang sama seperti kamu membacanya sendiri - permintaan `GET`
read-only, tempo yang manusiawi, satu room pada satu waktu. Tidak pernah memposting, tidak pernah
menghapus, tidak pernah mengikuti, dan tidak pernah menyentuh tab tempatmu login. Alat ini memang
harus menandatangani permintaan itu seperti aplikasinya, jadi token sesi dipakai **di dalam jendela
browser-nya sendiri**: tidak pernah ditulis ke disk, tidak pernah dicatat di log, dan tidak pernah
dibaca oleh program di luar jendela itu.

Satu proses terdiri dari lima fase (`gui.phase.*` di `src/lang/*.json`):

1. **Menyalakan browser** - `START.bat` memilih Node yang dijalankan: salinannya sendiri di
   `runtime\node` kalau unduhan portable yang dipakai, kalau tidak yang ada di `PATH`. Lalu
   `node src\gui.mjs` menyajikan halaman lokal dan membuka jendela browser.
2. **Menelusuri riwayat mundur** - satu baris JSONL per halaman riwayat ke
   `downloads/<room>/`, dan inilah yang membuat satu proses bisa dilanjutkan.
3. **Membangun halaman** - kedua ekspor dirender dari yang ada di disk; tidak ada jaringan di sini.
4. **Mengunduh foto dan video** - hanya media yang ditunjuk ekspornya.
5. **Mengemas zip** - hanya kalau pemilih meminta zip untuk dibagikan.

### Aturan keamanan yang diikuti alat ini

| aturan | alasannya |
| --- | --- |
| hanya GET - `/dm/v2.0/messages` dan endpoint `download-info` untuk video | tidak ada penulisan yang sampai ke akunmu, selamanya |
| tempo 1,5-3 detik dengan jitter, satu room pada satu waktu | terlihat seperti manusia yang menggulir |
| berhenti pada HTTP 429/403, tanpa percobaan paksa | tidak pernah menghantam API |
| token API dibaca di memori untuk menandatangani GET-nya sendiri | tidak ada yang berbentuk token ditulis ke disk atau masuk log |
| jendela dan profil browser sendiri | sesi yang kamu pakai untuk menjelajah tidak pernah dimuat ulang, ditutup atau dipindah |

Tidak ada yang bisa menjanjikan risiko nol. [`docs/FAQ.md`](docs/FAQ.md) berisi versi jujurnya,
termasuk apa yang harus dilakukan kalau kamu ragu.

### Baris perintah

`wdm.bat` (atau `node src/cli.mjs`) melakukan pekerjaan yang sama tanpa halamannya:

| perintah | apa yang dilakukannya |
| --- | --- |
| `wdm rooms` | daftar room di `rooms.unis.json` dan apa yang sudah diarsipkan |
| `wdm labels` | membaca nama room dari daftar DM ke `rooms.unis.json` (termasuk emoji) |
| `wdm harvest --room yunha` | menelusuri riwayat mundur (menyalakan browser privat) |
| `wdm render --room yunha` | membangun kedua ekspor (privat + publik) dari yang ada di disk |
| `wdm media --room yunha` | mengunduh foto dan video yang ditunjuk ekspor |
| `wdm share --room yunha` | satu zip di `share/`, dibuat dari ekspor publik |
| `wdm all --room yunha --share` | semua di atas, berurutan |
| `wdm doctor` | memeriksa node, browser, room dan folder |

### Tata letak keluaran

```
rooms/               ekspor privat: <room>.html, <room>.md, <room>.jsonl, summary.json, fonts/
rooms-public/        ekspor publik: berkas yang sama, hanya sisi artis
media/               photos/, video/, avatars/, fonts/ pada kualitas asli
downloads/<room>/    satu baris JSONL per halaman riwayat (inilah yang membuatnya bisa dilanjutkan)
share/               zip untuk dibagikan: weverse-dm-<room>.zip, satu per room
verify/              .sha256 + .manifest.json tiap zip (tidak ada yang perlu dikirim)
```

Room tidak pernah berbagi folder di bawah `downloads/`, jadi riwayat satu room tidak mungkin bocor ke
ekspor room lain. Ekspor selalu menunjuk ke media aslinya, jadi tidak ada tombol kualitas: satu room
kira-kira 2,5 GB, hampir semuanya foto dan video. Apa yang dikirim bersama repo (font, avatar) dan
apa isi setiap berkas ada di blok yang dilipat di akhir berkas ini.

### Halaman pembaca, selengkapnya

Setiap blok di bawah ini dilipat - buka yang kamu butuhkan.

<details>
<summary><b>Halaman pembaca secara detail</b></summary>

Kedua ekspor adalah satu halaman mandiri per room, dibangun untuk dibaca offline:

- **Privat** (`rooms/<room>.html`) - setiap pesan dari kedua sisi, bagian per hari, pesan artis
  disorot, penanda pesan yang dihapus dan bookmark-mu.
- **Publik** (`rooms-public/<room>.html`) - hanya sisi artis, tidak pernah ada bookmark, dan
  nickname-mu diganti `EverAfter` di semua tempat yang dicatat arsip (termasuk kalimat yang artis
  tulis dengan nama itu). `"publicRename"` di `config.json` tetap tersedia untuk pasangan
  `find=replace` tambahan.
- **Judul hari** dibaca seperti aplikasi menulisnya - `Sat, Sep 26, 2026` - di halaman maupun di
  markdown, dengan bentuk polos `2026-09-26` disimpan di luar layar di halaman itu supaya
  find-on-page tetap bekerja.
- **Tema** - gelap adalah bawaannya; tombol bulat di sudut kanan bawah beralih ke terang. Bubble-mu
  nyaris putih (`#f2f3f7`) di mode terang dengan artis di cyan pastel (`#bbf3f6`); mode gelap
  mengecat halaman hitam pekat (`#000`), bubble-mu `#1f1f1f` dan bubble artis cyan tua (`#016268`)
  dengan huruf putih. Pita hari yang lengket memakai hitam yang sama supaya tidak ada yang tembus di
  bawah tanggal, nickname satu warna abu (`#666666`) di kedua sisi, dan pilihannya diingat per
  browser.
- **Panel ⋯** terbuka dari kanan: lompat ke tanggal sebagai tab pertama, bookmark-mu sebagai tab
  kedua di ekspor privat (jumlahnya menempel di tombol sebagai lencana kecil, dan tombol serta
  tab-nya membawa tooltip) dan terjemahan sebagai tab terakhir setiap kali room membawanya. Panel
  menutup lewat tombol itu, lewat ✕, lewat Esc, dan lewat klik di luar panel. Chip bulan berupa
  daftar tautan di dalamnya, bukan baris di bawah judul, tab bookmark membawa ekspor dan impor JSON,
  dan di jendela lebar kotak halaman menyempit selebar panelnya sehingga kolom bacaan bergeser ke
  kiri panel alih-alih berada di belakangnya.
- **Header** menamai arsipnya, bukan room-nya: `Weverse DM Archive` dengan `by Hauitsu` berwarna
  abu, id room di baris bawahnya, dan foto artisnya bulat dengan lebar 96px (`--pf`, satu baris CSS;
  berkasnya sendiri 256x256 kalau kamu mau 1:1) dengan nama room di sebelahnya. Judul tab-nya adalah
  nama room diikuti `DM`, jadi sederet arsip yang terbuka terbaca sebagai room-nya sendiri.
- **Pesan yang isinya hanya foto atau video tidak mendapat bubble sama sekali** - media bulat itulah
  pesannya, seperti di aplikasi. Voice note tetap punya bubble (player-nya butuh badan), begitu juga
  gift dan apa pun yang punya caption.
- **Bubble gift** tetap tertutup persis seperti di aplikasi - kotak merah muda dengan pita dan
  busurnya - dan satu ketukan membukanya ke foto, video atau voice note di dalamnya. Tidak ada
  caption `[gift] NORMAL` di covernya: teks itu tetap ada di halaman hanya untuk screen reader dan
  find-on-page.
- **Percakapan yang sama sebagai teks dan sebagai data** - `rooms/<room>.md` dan `rooms/<room>.jsonl`,
  ditulis di kedua folder - dan **`media/`** menyimpan setiap berkas foto, video dan audio yang
  ditautkan percakapan, pada kualitas yang Weverse sajikan. Stempel waktunya memakai zona waktu yang
  alat ini deteksi di mesinmu.

</details>

<details>
<summary><b>Warna bubble dan chip hari</b></summary>

Setiap percakapan dibuka dengan pil yang sama seperti yang aplikasi pasang di sana: ikon hati,
jumlah hari kamu mengobrol, dan kata-kata setelahnya. Pil itu lengket, menempel di kanan atas
halaman seperti judul hari menempel di kiri atas, dan posisinya tepat di bawah judul hari itu - tidak
pernah menimpa tanggalnya. Hanya pil itu yang menerima klik; strip di sebelahnya membiarkan mouse
lewat ke pesan di bawahnya.

* **Angkanya** dihitung dari pesan pertama di arsip sampai **hari ini**, di zona waktumu sendiri, dan
  dihitung di halaman itu sendiri: biarkan arsipnya sebulan, buka, dan angkanya bertambah satu bulan.
  Arsip percakapan yang sudah berakhir tetap bertambah, itulah arti `+546 days together` di aplikasi.
* **Ikon hati, atau angkanya** membuka sepuluh warna bubble, dalam urutan milik aplikasi. Memilih satu
  mewarnai ulang bubble artis di room itu dan mengingatnya hanya di browser ini
  (`localStorage["wdm-bub"]`, dikunci per room).
* **Kata-kata setelah angka** - klik untuk menggantinya: apa saja, sampai 15 karakter, dan bawaannya
  juga pas dalam batas itu ("days together" 13 karakter, "hari bersama" 12). Enter menyimpan, Esc
  membatalkan editnya. Awalnya kata-kata itu mengikuti bahasa halaman ("days together", "일 함께",
  "hari bersama").

Sebuah room mulai dengan **cyan**, swatch paling kiri, dan tidak ada yang perlu direset: satu pilihan
mencakup kedua tema, jadi beralih ke mode terang tetap memakai pilihan itu dan hanya memakai versi
pastelnya. Swatch-nya memakai warna vivid milik aplikasi di kedua tema - itulah baris yang picker
tampilkan di aplikasi, dan tidak bergerak saat kamu memilih. Bubble-nya yang berubah: versi tua di
mode gelap, dengan huruf selalu putih, dan versi pastel dari pilihan yang sama di mode terang.

| pilihan | mode gelap | mode terang |
|---|---|---|
| cyan | `#016268` | `#bbf3f6` |
| green | `#0b5b1e` | `#DAFDDA` |
| blue | `#00456e` | `#D9EFFF` |
| purple | `#3f3494` | `#E4E3FD` |
| pink | `#6b236f` | `#FDE0FE` |
| yellow | `#6c5301` | `#FFEDC6` |
| orange | `#7e4323` | `#FFE3D6` |
| pink-red | `#79253c` | `#FEDFE4` |
| red | `#7b241b` | `#FFE0DB` |
| grey | `#44474e` | `#45474F` |

Set gelapnya memang berhuruf putih. Di mode terang warna hurufnya mengikuti bubble-nya, bukan daftar
yang dirawat manual: renderer mengukur tiap pastel dan memilih hitam atau putih, jadi yang abu
berakhir putih di atas abu sementara pastelnya tetap gelap - dan pesannya, terjemahannya dan
tautannya semua ikut bergerak bersama. Tombol hati di bar memakai warna yang sedang dipilih, jadi
pilihannya terlihat walau picker-nya tertutup. Bubble-mu sendiri tidak punya garis tepi sama sekali -
1px-nya tetap ada tapi transparan, jadi kedua sisi punya kotak yang sama dan tidak ada yang bergeser.
Tepi bubble artis digeser satu langkah ke arah putih (gelap) atau hitam (terang), disetel supaya
jaraknya sama 1,25:1 terhadap setiap isian; konstantanya `OUTLINE_KONTRAS` di `src/render.mjs`.

Tidak ada yang lain tersentuh. Bubble-mu tetap warnanya, cover gift tetap merah muda mereknya, dan
pesan yang isinya hanya media tidak punya bubble untuk diwarnai. Cyan memang titik awal aplikasinya
juga, jadi arsip yang belum pernah dipilihkan warna tetap terlihat seperti aplikasi. Chip ini ikut
terkirim di **kedua** ekspor - ini preferensi membaca seperti tombol tema, dan tidak membawa data
obrolanmu sedikit pun. `src/ui.js` membangunnya setelah halaman dimuat, jadi markup-nya tetap ramping.

</details>

<details>
<summary><b>Teks asli dan terjemahan bawaan</b></summary>

Pesan artis bisa membawa dua teks: yang artis ketik dan baris bahasa Inggris yang Weverse tampilkan di
bawahnya. Halaman ini menampilkan keduanya - terjemahannya sebagai baris miring yang lebih kecil di
dalam bubble yang sama.

Cara pasangan itu dibaca adalah satu pilihan untuk seluruh halaman, bukan per pesan. Tab
**Translation** di panel memilih antara

* **Original + English** - keduanya, bawaan,
* **Original** - kata-kata yang artis ketik, terjemahannya disembunyikan,
* **English** - terjemahannya saja.

Tiga mode yang sama ada di menu ⋯ di sebelah pesan mana pun di ekspor privat (untuk ekspor publik
hanya lewat panel itu). Pilihannya disimpan di `localStorage`, jadi per browser dan per arsip, dan
dipasang di `<html>` sebelum paint pertama - halaman yang kamu baca dalam mode English tidak pernah
berkedip menampilkan teks aslinya lebih dulu. Bubble yang tidak punya terjemahan tetap menampilkan
teksnya di semua mode; hanya pesan yang benar-benar punya keduanya yang berubah. Ekspor markdown
menampilkan pasangan itu dengan cara yang sama, baris miring di bawah teks aslinya.

Renderer hanya memunculkan tab dan item menu itu kalau room-nya memang membawa terjemahan, jadi arsip
tanpa terjemahan tidak punya tombol dan tidak ada ruang kosong. `src/ui.js` yang membangun tombolnya -
berkasnya sudah membawa kedua teks, dan pergantian mode tidak pernah memuat atau menulis ulang apa pun.

</details>

<details>
<summary><b>Bookmark</b></summary>

Bookmark itu buatanmu sendiri, di dalam halaman. Setiap pesan membawa tombol tiga titik yang sama
seperti di aplikasi - tombol itu muncul saat pointer ada di baris itu (dan menyingkir di saat lain,
dengan ruangnya selalu disediakan supaya tidak ada yang bergeser), dan di layar sentuh, yang tidak
punya hover, tombol itu selalu ada. Isinya

* **Bookmark this message** - pesannya dapat bintang dan satu baris di panel bookmark, di balik
  tombol ⋯ di sudut kanan atas (tab kedua panel itu, tab pertamanya lompat ke tanggal),
* **Translation** - tiga mode membaca yang sama seperti tab translation di panel (lihat di atas);
  item menu itu hanya jalan masuk, pilihannya mencakup seluruh halaman,
* **Copy text** - teksnya ke clipboard (atau tautan medianya, atau jenis medianya),
* **Copy date and time** - stempel waktunya, untuk mengutip pesan di tempat lain.

Daftarnya mulai kosong dan hidup hanya di browser-mu: `localStorage`, per room, di mesinmu sendiri.
Tidak ada yang dikirim ke mana pun dan tidak ada berkas yang ditulis ulang. `src/bm.js` membangun
tombolnya setelah halaman dimuat, jadi markup-nya tetap ramping - tombol tiga titik untuk 9.574 pesan
tidak memakan HTML sama sekali.

**Menyimpan daftar di luar browser**

* **Export JSON** menyimpan `bookmarks-<slug>.json`, bentuk yang sama dengan yang dibaca renderer.
* **Import JSON** membacanya kembali, melewati apa pun yang tidak dimiliki room itu atau sudah ada.

Taruh berkas hasil ekspor di sebelah room sebagai `downloads/<slug>/bookmarks.json` dan render
berikutnya menanamkannya sebagai daftar awal. Menghapus bintang hanya menyembunyikannya dari daftar -
pesannya tetap ada di arsip - dan memberi bintang lagi mengembalikannya. Tanda `x` di baris yang kamu
tambahkan sendiri membuang bookmark tunggal itu.

</details>

<details>
<summary><b>Menawarkan room lengkap ke kolektornya</b></summary>

Room yang di-backup dari awal sekali riwayat grupnya bisa dikembalikan ke orang yang mengumpulkannya.
Popup **Share** lalu bertambah tombol **Share to Hauitsu**; menekannya menampilkan pesan singkatnya
sendiri dan satu tombol yang membuka folder shared drive, tempat zip-nya bisa dijatuhkan. Hanya room
yang arsipnya mulai dari April 2025 dan masih mencapai bulan berjalan yang ditawarkan - backup yang
berhenti tiga bulan lalu justru kehilangan bagian yang tidak bisa diambil lagi nanti. Memegang room
seperti itu secara lengkap adalah yang dihitung, room mana pun itu; `collectOwned` di `config.json`
bisa mengeluarkan slug tertentu kalau kamu lebih suka tidak dimintai. Tautannya sendiri tidak ditulis
di repositori ini: tautan itu dirangkai saat tombolnya ditekan, yang menjaganya dari kotak pencarian,
walau tidak dari siapa pun yang membaca source-nya. `collectUrl` di `config.json` menggantinya. Setelah
proses pertama yang membuatmu memegang room seperti itu, pesan itu juga muncul sendiri - sekali per
instalasi. Saat sedang mengerjakan popup-nya, `collectDebug: true` di `config.json` menawarkan
tombolnya di setiap room, arsipnya lengkap atau tidak, dan menampilkan pesannya setelah setiap proses
yang selesai.

</details>

<details>
<summary><b>Font, avatar dan media</b></summary>

`media/fonts/` dan `media/avatars/<room>-artist.*` adalah pengecualian dari "media adalah hasil
unduhan": font emoji dan foto artisnya ikut dikirim bersama repo (Apple Color Emoji, dengan Noto
Color Emoji sebagai cadangan OFL-1.1), jadi clone yang baru merender halaman dengan cara yang sama di
setiap mesin dan tidak pernah memuat font atau wajah dari internet. Emoji Apple yang dipakai halaman:
`media/fonts/apple-emoji.woff2` dikirim dalam bentuk terpangkas ke emoji yang benar-benar dipakai
arsipmu (sekitar 3 MB), dan `node tools/get-apple-emoji.mjs` membangun ulang pangkasan itu dari rilis
[samuelngs/apple-emoji-ttf](https://github.com/samuelngs/apple-emoji-ttf) (`--remove` menghapusnya
supaya halaman jatuh ke Noto). Desain emoji Apple milik Apple - repo hulunya menyatakan hanya untuk
penggunaan edukasi - jadi perlakukan arsipnya sebagai penggunaan pribadi.

Asli ukuran penuhnya tetap ada di `media/avatar-src/` (tidak dipublikasikan). Lingkaran avatar itu
opsional: `wdm labels` menyimpan satu gambar per room sebagai `media/avatars/<room>-artist.<ext>`, dan
`media/avatars/artist.png` / `me.png` yang dibagi bersama tetap berfungsi sebagai cadangan. Tanpa
berkas-berkas itu semua, halamannya dirender tanpa avatar.

</details>

<details>
<summary><b>Nama room di daftar room</b></summary>

Nama yang halaman tampilkan untuk sebuah room berasal dari `rowLabel` di `rooms.unis.json` - teks yang
daftar room di aplikasi tampilkan, termasuk emoji. `wdm labels` mengisinya: ia membuka jendela
browser milik alat ini, membaca nama-namanya dari halaman daftar DM (`https://dm.weverse.io/`) dan
menuliskannya kembali. `wdm labels --snippet` mencetak probe yang sama untuk ditempel ke DevTools,
dan `wdm labels --from names.json` mengimpor hasilnya. API DM tidak pernah membawa nama artisnya
sendiri, hanya nickname-mu, jadi daftar itulah sumber nama-namanya.

</details>

<details>
<summary><b>Di mana alat ini menyimpan berkasnya sendiri</b></summary>

Arsipnya ditulis di dalam folder tempat alat ini berada. Profil browser milik alat ini - jendela
tempat kamu login, yang disimpan terpisah dari browser normalmu - berada di bawah `%LOCALAPPDATA%` di
Windows.

</details>

## Ikut berkontribusi

Id room untuk grup lain, terjemahan UI (Inggris, Korea dan Indonesia sudah tersedia) dan laporan bug
sangat diterima - lihat [`docs/ROADMAP.md`](docs/ROADMAP.md).

**Penguji macOS dan Linux paling dicari.** Alat ini baru pernah dijalankan di Windows, jadi jawaban
jujur untuk "jalan nggak di Mac?" adalah belum ada yang tahu. Kalau kamu mau mencoba, salinan source
dan langkah di [Yang kamu butuhkan](#yang-kamu-butuhkan-dan-yang-tidak-akan-dilakukannya) sudah cukup;
lalu laporkan apa yang terjadi - perintah persisnya, browser yang kamu tunjuk lewat `browserPath`,
keluaran terminalnya, dan di mana berhentinya. Laporan bahwa itu jalan sama berharganya dengan laporan
bahwa itu gagal: dua-duanya mengubah "diharapkan jalan" menjadi sesuatu yang jujur boleh ditulis
"teruji". Patch yang menambah peluncur macOS atau path browser macOS diterima **beserta** laporan dari
mesin macOS sungguhan; tanpa itu tidak bisa disebut didukung.

## Lisensi

MIT - lihat `LICENSE`.
