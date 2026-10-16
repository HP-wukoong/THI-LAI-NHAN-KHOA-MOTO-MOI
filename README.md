# Sổ sát hạch A1 · Cơ sở Hoài Nhơn

Công cụ quản lý **thi lại mô tô hạng A1** và **nhận hồ sơ các khóa mới dự kiến** của Công ty CP Đào tạo và Dịch vụ GTVT Bình Định – CSHN.

**Mở ứng dụng:** https://hp-wukoong.github.io/THI-LAI-NHAN-KHOA-MOTO-MOI/

## Chức năng chính
- Tra cứu học viên (gõ / quét QR CCCD), tính phần thi lại và lệ phí **theo đúng ngày thi của đợt**, hạn bảo lưu 12 tháng.
- Đăng ký thi lại, thu tiền nhiều lần (tiền mặt / chuyển khoản), số phiếu thu PT-năm-số liên tục, phiếu chi khi hoàn tiền.
- Phiếu thu nửa A4 kèm mã QR của đợt, danh sách thi lại mẫu chuẩn (_LOCTL), đối soát kỳ thi, mời thi lại, rút hồ sơ.
- Chốt quỹ cuối ca (bảng kê mệnh giá, biên bản BÊN GIAO / BÊN NHẬN), tổng kết tiền, báo cáo tháng / quý / năm.
- Khóa mới dự kiến: chỉ tiêu, các lần nhận hồ sơ, rút hồ sơ, lịch sử đối chiếu.
- Người dùng & phân quyền (Quầy / Kế toán / Quản lý), nhật ký thao tác, kiểm tra toàn vẹn dữ liệu.

## Dữ liệu ở đâu? (quan trọng)
- **Dữ liệu KHÔNG nằm trên GitHub và không gửi lên mạng.** Kho này chỉ chứa phần mềm.
- Dữ liệu được lưu trong **thư mục trên máy** do bạn chọn (nút *Chọn thư mục* trong ứng dụng):
  `so_thu.json`, `ket_qua_sat_hach.json`, `sao_luu/` (theo giờ, ngày, tháng), `nhat_ky/`.
- Khuyến nghị: đặt thư mục dữ liệu trong **OneDrive / Google Drive bản cài trên máy** để đổi máy, nhiều máy dùng chung; bật **mã hoá dữ liệu** trong ứng dụng; mỗi tuần **Sao lưu ra Excel** cất USB.
- File `.gitignore` đã chặn mọi file dữ liệu (`*.json` dữ liệu, `*.xlsx`, `sao_luu/`…) để không lỡ tay đẩy lên.

## Đổi sang máy khác
1. Cài Chrome hoặc Edge (và OneDrive / Google Drive nếu dữ liệu để ở đó).
2. Mở địa chỉ ứng dụng ở trên → menu ⋮ → **Cài đặt ứng dụng** (để có biểu tượng như phần mềm).
3. Trong ứng dụng: **Dữ liệu & cài đặt → Chọn thư mục lưu dữ liệu** → chọn đúng thư mục dữ liệu cũ. Xong.

## Dùng không cần mạng
Mở một lần khi có mạng, sau đó ứng dụng chạy được cả khi mất mạng. Có mạng lại thì tự lấy phiên bản mới.
Vẫn có thể tải file `docs/index.html` về máy và mở trực tiếp như trước.

## Cập nhật phần mềm (cho người bảo trì)
- Mã nguồn ở `src/` (`app.html`, `core.js` tính phí & bảo lưu, `store.js` lưu trữ, `money.js` tiền & chốt quỹ, `mgmt.js` quản lý, `khoa.js` khóa mới).
- Sửa `src/…`, tăng `APP_VERSION` và ghi `CHANGELOG` trong `src/app.html`, rồi chạy `python build.py` để tạo lại `docs/index.html` và `docs/sw.js`, commit và push. GitHub Pages tự cập nhật.
- Thư viện Excel: `vendor/xlsx.bundle.js` (xlsx-js-style, giấy phép Apache-2.0).

## Bật GitHub Pages (một lần)
Settings → Pages → *Build and deployment* → Source: **Deploy from a branch** → Branch: **main**, thư mục **/docs** → Save.
(Nếu để thư mục **/ (root)** thì trang gốc tự chuyển sang `docs/`.)
