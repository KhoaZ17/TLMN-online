# 🃏 Tiến Lên Miền Nam

Game bài **Tiến Lên Miền Nam** chơi với máy: bạn ngồi cùng 1–3 Bot, đánh bài ngược chiều kim đồng hồ, chặt Heo, chặt hàng, ăn tiền cược. Có hai chế độ: **Thường** (bộ bài 52 lá) và **Joker** (thêm 4 lá Joker, mỗi người 14 lá, nhiều bộ mới).

Giao diện chạy trên trình duyệt, tối ưu cho **điện thoại xoay ngang**: bài được chia, lật, xếp và bay ra giữa bàn mượt như đánh bài thật.

\---

## 1\. Game này là gì?

Mục tiêu rất đơn giản: **hết bài đầu tiên**. Người về nhất ăn tiền, những người còn lại đền theo số bài còn trên tay. Bài càng nhiều, càng có hàng hay Heo kẹt trên tay thì càng đau ví.

|||
|-|-|
|Số người|2–4 (Bạn + 1 đến 3 Bot)|
|Bài|13 lá/người (Thường), 14 lá/người (Joker)|
|Thứ tự lá|`3 4 5 6 7 8 9 10 J Q K A 2` (2 = **Heo**, lớn nhất)|
|Thứ tự chất|Bích ♠ < Chuồn ♣ < Rô ♦ < Cơ ♥ (cùng hạng thì so chất)|
|Tiền|Mặc định cược 1.000, vốn 500.000 mỗi người|
|Thời gian|30 giây mỗi lượt, hết giờ máy tự đánh thay|

**Hai cách tính tiền** (chọn lúc tạo bàn):

* **Đếm lá**: còn bao nhiêu lá trên tay thì đền bấy nhiêu lần cược.
* **Nhất ăn tất**: thua là đền một mức cố định, gọi là một tụ, không quan tâm còn mấy lá. Các hệ số phạt nhỏ hơn 10 lần so với Đếm lá.

Hết tiền thì ván sau ngồi lại từ đầu; Bot phá sản sẽ được thay bằng Bot mới.

\---

## 2\. Cách đánh bài (chung cho cả hai chế độ)

**Lượt đầu tiên:** ván đầu, ai cầm lá nhỏ nhất (thường là **3♠**) đánh trước, và nước đầu **bắt buộc chứa lá đó** (lá này được viền sáng cho dễ thấy). Từ ván sau, người thắng ván trước đánh trước, muốn đánh gì tuỳ ý.

**Đè bài:** phải đánh **cùng loại, cùng số lá, lớn hơn** bộ đang nằm trên bàn. So lá cao nhất của bộ: hạng trước, chất sau. Không đè được thì **bỏ lượt**. Bàn trống thì không được bỏ lượt.

**Bỏ lượt là bỏ luôn cả vòng:** đã bỏ thì chỉ quay lại được bằng cách **chặt**. Khi cả bàn đã bỏ hết, người đánh bộ cuối cùng được đi tự do.

### Các bộ được đánh

|Bộ|Mô tả|
|-|-|
|**Lẻ**|1 lá|
|**Đôi**|2 lá cùng hạng|
|**Xám cô**|3 lá cùng hạng|
|**Sảnh**|Từ 3 lá liên tiếp trở lên|
|**3 đôi thông**|3 đôi liên tiếp (hàng)|
|**Tứ quý**|4 lá cùng hạng (hàng)|
|**4 đôi thông**|4 đôi liên tiếp (hàng)|

Sảnh và đôi thông chỉ chạy đến **Ách**, **không chứa Heo**.

### Chặt Heo, chặt hàng

|Bộ chặt|Chặt được|
|-|-|
|3 đôi thông|1 Heo, 3 đôi thông nhỏ hơn|
|Tứ quý|1 Heo, đôi Heo, 3 đôi thông, Tứ quý nhỏ hơn|
|4 đôi thông|1 Heo, đôi Heo, 3 đôi thông, Tứ quý, 4 đôi thông nhỏ hơn|

Nếu bạn đã bỏ lượt trước đó nhưng đang cầm 4 đôi thông, và trên bàn xuất hiện bộ có thể bị chặt, thì bạn được cấp **15 giây** để quyết định có chen lượt vào chặt hay không.

\---

## 3\. Tiền phạt: hũ phạt, chặt và chốt vòng

Mỗi lần có người đánh ra **hàng, Heo hoặc Joker**, một khoản phạt được cộng dồn vào **hũ phạt** (sảnh thì không). Ai **chặt** thành công sẽ thành người thắng chờ chốt. Nếu vòng đó khép lại mà không ai chặt tiếp, người bị chặt nộp **toàn bộ hũ** cho người chặt (tối đa bằng số tiền họ đang có). Nếu người chặt lại bị chặt đè thì hũ chuyển sang người chặt sau.

**Bảng điểm phạt** (nhân với tiền cược):

|Lá / bộ đánh ra|Đếm lá|Nhất ăn tất|
|-|:-:|:-:|
|5 đôi thông *(Chế độ Joker)*|60|6|
|4 đôi thông|50|5|
|Tứ quý|40|4|
|3 đôi thông|30|3|
|Joker đỏ (♦♥) *(Chế độ Joker)*|25|2,5|
|Heo đỏ (2♦ 2♥)|20|2|
|Joker đen (♠♣) *(Chế độ Joker)*|15|1,5|
|Heo đen (2♠ 2♣)|10|1|

### Khi có người về nhất

Người còn bài trả tiền cho người thắng:

* **Đếm lá**: số lá còn lại cộng tiền phạt các hàng/Heo/Joker còn kẹt trên tay.
* **Nhất ăn tất**: bắt đầu tính từ 1 tụ và cộng tiền phạt các hàng/Heo/Joker còn trên tay.
* Hệ thống sẽ tự động tính ra tiền phạt **lớn nhất có thể** từ tay bài người thua.

Sau đó nhân với các **hệ số đặc biệt** (nhân chồng lên nhau):

|Tình huống|Hệ số|
|-|:-:|
|**Cóng**: thua mà chưa đánh được lá nào|×2|
|**Đút 3 bích**: người thắng kết thúc bằng đúng một lá 3♠ lẻ|×3|
|**Thối 3 bích**: người thua còn giữ 3♠ trên tay|×3|

\---

## 4\. Chế độ Thường (52 lá, 13 lá/người)

### Các bộ được đánh

Lẻ, Đôi, Xám cô, Sảnh, 3 đôi thông, Tứ quý, 4 đôi thông.

### Tới trắng

**Tới trắng** là bộ bài đẹp đến mức thắng ngay lúc chia, không cần đánh. Mỗi người không tới trắng phải trả cho người tới trắng **hệ số × tiền cược**.

**Có hiệu lực mọi ván:**

|Bộ tới trắng|Đếm lá|Nhất ăn tất|
|-|:-:|:-:|
|**Sảnh rồng** (3 → A, đủ 12 lá)|×70|×7|
|**5 đôi thông**|×60|×6|
|**Tứ quý Heo**|×50|×5|
|**6 đôi**|×40|×4|

**Chỉ ván đầu tiên** (các bộ có chứa 3♠):

|Bộ tới trắng|Đếm lá|Nhất ăn tất|
|-|:-:|:-:|
|4 đôi thông có 3 bích|×30|×3|
|Tứ quý 3|×20|×2|
|3 đôi thông có 3 bích|×10|×1|

Nếu hai người cùng tới trắng thì người **mạnh hơn** nhận phần chênh lệch hệ số. Nếu cùng loại thì người có lá lớn nhất thắng thêm 10 lần cược (Đếm lá) hoặc 1 lần cược (Nhất ăn tất).

> ⚠️ \\\\\\\*\\\\\\\*Lưu ý hiện tại:\\\\\\\*\\\\\\\* backend đang \\\\\\\*\\\\\\\*chia lại bài\\\\\\\*\\\\\\\* nếu ai đó bốc phải bài tới trắng (vòng kiểm tra trong `reset()` của `tlmn\\\\\\\_sample\\\\\\\_env.py`). Bảng trên là luật đã cài sẵn trong `tlmn\\\\\\\_rules.py`. Muốn tới trắng xảy ra thật trong ván, hãy bỏ vòng chia lại đó.

\---

## 5\. Chế độ Joker (56 lá, 14 lá/người)

Bộ bài có thêm **4 lá Joker có chất khác nhau** (♠ ♣ ♦ ♥). Joker là lá "đa năng", có thể biến hình thành lá khác để tạo bộ hoàn chỉnh.

### Cách dùng Joker

* **Joker mang một chất cố định**, khi dùng thì sẽ thay thành lá có giá trị mang chất đó, và chỉ thay được lá **không trùng** **với** **lá thật đã xuất hiện trong bộ.**
* Nếu một bộ có **nhiều cách ghép Joker**, bạn được **chọn** trong cửa sổ hiện ra (Bot tự lấy cách đầu tiên).
* Joker dùng được cho mọi bộ: đôi, sảnh, tứ quý, đôi thông, kể cả Heo.
* Nếu **Joker biến thành Heo mà Heo đó bị chặt**, thì bị phạt tiền Heo và Joker màu đó.

### Các bộ được đánh

Tất cả các bộ của chế độ Thường, cộng thêm:

|Bộ mới|Mô tả|
|-|-|
|**5 đôi thông**|5 đôi liên tiếp (hàng)|

* **5 đôi thông chặt được:** 1 Heo, đôi Heo, 3 Heo, 3 đôi thông, Tứ quý, 4 đôi thông và 5 đôi thông nhỏ hơn.
* Khi trên tay bài của người chơi có cách tạo ra **4 đôi thông hoặc 5 đôi thông** bất kể có dùng Joker hay không, nếu họ đã bỏ lượt và trên bàn xuất hiện bộ có thể bị chặt, thì người đó được cấp 15 giây để quyết định có chen lượt vào chặt hay không.

### Tiền phạt riêng của Joker

* Đánh Joker ra bàn cũng cộng vào hũ phạt: **Joker đỏ (♦♥) 25**, **Joker đen (♠♣) 15** (Đếm lá).
* Thua mà còn giữ Joker, thì chúng nó sẽ tự biến hình thành những lá sao cho tiền phạt là lớn nhất. Joker không tự biến thành Heo, vì Heo có tiền phạt ít hơn Joker (xem bảng để so sánh).
* Cóng, Đút 3 bích và Thối 3 bích tính **giống chế độ Thường**.

### Tới trắng

**Có hiệu lực mọi ván:**

|Bộ tới trắng|Đếm lá|Nhất ăn tất|
|-|:-:|:-:|
|**Bát quái Heo** (đủ 4 Heo thường và 4 Joker)|×90|×9|
|**6 đôi thông**|×80|×8|
|**Sảnh rồng** (3 → A)|×70|×7|
|**7 đôi**|×60|×6|
|**Tứ quý Heo**|×50|×5|

**Chỉ ván đầu tiên** (các bộ có chứa 3♠):

|Bộ tới trắng|Đếm lá|Nhất ăn tất|
|-|:-:|:-:|
|5 đôi thông có 3 bích|×40|×4|
|4 đôi thông có 3 bích|×30|×3|
|Tứ quý 3|×20|×2|
|3 đôi thông có 3 bích|×10|×1|

Cách chi trả khi tới trắng giống chế độ Thường, và lưu ý về việc chia lại bài ở mục 4 cũng áp dụng cho chế độ này.

\---

## 6\. Chạy game

**Backend** (Python, FastAPI):

```bash
cd tlmn\\\\\\\_backend/core
pip install fastapi uvicorn numpy
python server.py        # chạy ở cổng 8000
```

**Frontend** (React + Vite + Tailwind):

```bash
cd tlmn\\\\\\\_frontend
npm install
```

Chép ảnh lá bài vào `public/assets/cards/`.

* **Đang code:** `npm run dev`, rồi mở địa chỉ Vite in ra (thường là `http://localhost:5173`).
* **Chơi gọn bằng 1 server:** `npm run build`, rồi chạy `python server.py` và mở `http://localhost:8000`. Đặt thư mục `tlmn\\\\\\\_frontend` cạnh thư mục `tlmn\\\\\\\_backend` để server tìm thấy bản build.

**Chơi trên điện thoại:** cho điện thoại và máy tính **cùng WiFi**, mở `http://<IP-máy-tính>:8000` (hoặc cổng của Vite) và xoay ngang màn hình.

\---

## 7\. Điểm nổi bật khi chơi

* 📱 Giao diện xoay ngang, bài xếp quạt, chạm để chọn, nút **Đánh bài / Bỏ lượt** tự biết lúc nào dùng được.
* 🎴 Chia bài, lật bài, tự xếp bài rồi mới tính giờ; bài đánh ra bay thẳng vào giữa bàn.
* ⏱ Đồng hồ đếm ngược ngay cạnh mỗi người chơi.
* 💰 Tiền thắng thua bay lên sau mỗi ván, bài người thua được lật ra cho cả bàn xem.
* 🤖 Bot "suy nghĩ" như người thật trước khi đánh.
* 🔥 Hũ phạt, chặt Heo, chặt hàng, Cóng, Thối 3 bích: đủ kịch tính ngay cả khi chơi một mình.

**Chúc bạn tới nhất!**

