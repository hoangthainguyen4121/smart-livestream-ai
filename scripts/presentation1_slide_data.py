# -*- coding: utf-8 -*-
"""Presentation 1 — slide data (S1–S25). Source: Ch.1–3, Figure Freeze, Literature Freeze."""
from __future__ import annotations

TITLE_THESIS = (
    "Xây dựng hệ thống hỗ trợ bán hàng thông minh cho livestream "
    "ứng dụng trí tuệ nhân tạo và thị giác máy tính"
)

# Each slide: title, objective, bullets, visual, image, table, notes, transition, minutes
SLIDES: list[dict] = [
    {
        "id": "S1",
        "chapter": "—",
        "section": "—",
        "title": "Hệ thống hỗ trợ bán hàng thông minh livestream",
        "objective": "Giới thiệu đề tài và định vị trọng tâm nghiên cứu là hệ thống, không phải một thuật toán đơn lẻ.",
        "bullets": [
            TITLE_THESIS,
            "Thạc sĩ CNTT — Thuyết trình 1",
            "[Họ tên SV] · [GVHD] · [Ngày]",
        ],
        "visual": "Slide tiêu đề academic, nền trắng/xám nhạt, logo trường (nếu có).",
        "image": None,
        "table": None,
        "notes": (
            "Kính chào thầy cô trong Hội đồng. Em xin trình bày đề tài xây dựng hệ thống hỗ trợ bán hàng "
            "thông minh trong phiên livestream, ứng dụng trí tuệ nhân tạo và thị giác máy tính. "
            "Trọng tâm luận văn là một nguyên mẫu tích hợp phục vụ người phát trong phiên bán hàng — "
            "không phải nghiên cứu riêng về PhoBERT hay một thư viện nhận diện. "
            "Phần trình bày hôm nay tập trung bài toán, cơ sở lý thuyết và thiết kế hệ thống tại Chương 3."
        ),
        "transition": "Tiếp theo, em xin trình bày cấu trúc nội dung trình bày.",
        "minutes": 0.5,
    },
    {
        "id": "S2",
        "chapter": "1",
        "section": "1.5",
        "title": "Nội dung trình bày",
        "objective": "Cho hội đồng nắm roadmap 23 phút và trọng tâm thiết kế hệ thống.",
        "bullets": [
            "Ch.1: Bài toán và phương pháp",
            "Ch.2: Thách thức và khoảng trống",
            "Ch.3: Thiết kế hệ thống (trọng tâm)",
            "Kết luận và kế hoạch Ch.4",
        ],
        "visual": "Sơ đồ 4 khối ngang; ghi chú luận văn 5 chương.",
        "image": None,
        "table": None,
        "notes": (
            "Bài trình bày gồm bốn phần chính. Phần đầu đặt bài toán và phương pháp từ Chương 1. "
            "Phần hai tóm lược thách thức, hai trụ cột công nghệ và khoảng trống nghiên cứu từ Chương 2. "
            "Phần trọng tâm — chiếm phần lớn thời lượng — là thiết kế hệ thống Chương 3: yêu cầu, kiến trúc, "
            "xử lý hình ảnh, bình luận, trợ lý và triển khai. Cuối cùng em tóm tắt và nêu hướng đánh giá tại Chương 4. "
            "Luận văn gồm năm chương theo trục bài toán → thiết kế → hiện thực → kết luận."
        ),
        "transition": "Bắt đầu từ bối cảnh thực tế khiến đề tài cần thiết.",
        "minutes": 0.7,
    },
    {
        "id": "S3",
        "chapter": "1",
        "section": "1.1",
        "title": "Bài toán livestream và áp lực vận hành",
        "objective": "Chứng minh áp lực nghiệp vụ đủ lớn để cần hệ thống hỗ trợ tích hợp.",
        "bullets": [
            "Tương tác thời gian thực = giá trị mua bán",
            "Quá tải bình luận — người phát không kịp",
            "Thiếu thử sản phẩm trực quan trên phiên",
            "Các công cụ hỗ trợ thường triển khai rời rạc",
        ],
        "visual": "Hình 1.1 — bối cảnh quá tải bình luận.",
        "image": "hinh_1_1_livestream_context.png",
        "table": None,
        "notes": (
            "Livestream commerce coi tương tác trực tiếp là thành phần của giá trị mua bán: người xem vừa theo dõi "
            "vừa gửi hàng loạt bình luận về giá, tồn kho, chốt đơn. Người phát phải vừa trình diễn vừa phản hồi — "
            "khi tốc độ bình luận vượt khả năng xử lý thủ công, cơ hội chốt đơn bị bỏ sót. "
            "Song song đó, người xem cần hình dung sản phẩm trực quan nhưng thường chỉ xem mô tả bằng lời. "
            "Cử chỉ quan tâm trên camera cũng khó được ghi nhận nếu chỉ theo dõi chat. "
            "Thực tế, AR, chatbot và nhận diện thường là công cụ tách rời — đó là điểm xuất phát của đề tài."
        ),
        "transition": "Từ bài toán này, em chuyển sang mục tiêu và phạm vi nghiên cứu.",
        "minutes": 2.0,
    },
    {
        "id": "S4",
        "chapter": "1",
        "section": "1.2",
        "title": "Mục tiêu nghiên cứu",
        "objective": "Khẳng định mục tiêu là hệ thống hỗ trợ bán hàng tích hợp hai trụ cột.",
        "bullets": [
            "Nguyên mẫu web tích hợp CV + NLP",
            "Thử AR, nhận diện, phân loại bình luận",
            "Trợ lý bán hàng và mua hàng mô phỏng",
            "Đóng góp Đ1–Đ3 (chi tiết slide 12)",
        ],
        "visual": "Bảng 1.1 rút gọn — mục tiêu và tiêu chí.",
        "image": None,
        "table": [
            ["Mục tiêu", "Tiêu chí đánh giá (rút gọn)"],
            ["Thử sản phẩm AR", "Hiệu ứng trên luồng camera"],
            ["Phân loại ý định", "11 lớp · PhoBERT + luật"],
            ["Trợ lý bán hàng", "AUTO / ESCALATE / IGNORE"],
            ["Mua hàng mô phỏng", "Giỏ → mã đơn LS-*"],
        ],
        "notes": (
            "Mục tiêu tổng quát là xây dựng nguyên mẫu hỗ trợ bán hàng trên trình duyệt web. "
            "Cụ thể, hệ thống cần hỗ trợ thử sản phẩm bằng thực tế tăng cường, ghi nhận khuôn mặt và cử chỉ, "
            "phân loại ý định bình luận tiếng Việt, vận hành trợ lý bán hàng và mô phỏng quy trình mua hàng. "
            "PhoBERT là công cụ phục vụ phân loại ý định — không phải đề tài độc lập. "
            "Tiêu chí đánh giá định tính được tóm tắt tại Bảng 1.1; kết quả đo lường sẽ trình bày tại Chương 4."
        ),
        "transition": "Mục tiêu trên được giới hạn bởi phạm vi nghiên cứu sau đây.",
        "minutes": 1.5,
    },
    {
        "id": "S5",
        "chapter": "1",
        "section": "1.3",
        "title": "Phạm vi nghiên cứu",
        "objective": "Làm rõ giới hạn nguyên mẫu để hội đồng không kỳ vọng quá phạm vi.",
        "bullets": [
            "Trong: nguyên mẫu web · tiếng Việt",
            "10 sản phẩm mô phỏng · Docker cục bộ",
            "Ngoài: CSDL đơn hàng · OAuth",
            "Không cổng thanh toán thật",
        ],
        "visual": "Bảng 1.2 — trong / ngoài phạm vi.",
        "image": None,
        "table": None,
        "notes": (
            "Trong phạm vi, luận văn hiện thực nguyên mẫu trên trình duyệt web với danh mục mười sản phẩm mô phỏng, "
            "huấn luyện PhoBERT trên tập dữ liệu domain và triển khai thử nghiệm cục bộ hoặc bằng Docker. "
            "Dữ liệu phiên lưu tạm, mất khi khởi động lại dịch vụ. "
            "Ngoài phạm vi: cơ sở dữ liệu đơn hàng bền vững, xác thực OAuth, cổng thanh toán thật và triển khai quy mô sản xuất. "
            "Ran giới này giúp tập trung đánh giá tính khả thi thiết kế tích hợp, không mở rộng sang hạ tầng thương mại điện tử đầy đủ."
        ),
        "transition": "Với phạm vi đó, em áp dụng phương pháp nghiên cứu sau.",
        "minutes": 1.5,
    },
    {
        "id": "S6",
        "chapter": "1",
        "section": "1.4",
        "title": "Phương pháp nghiên cứu",
        "objective": "Trình bày trình tự nghiên cứu ứng dụng từ bài toán đến đánh giá.",
        "bullets": [
            "Nghiên cứu ứng dụng",
            "Bài toán → thách thức → thiết kế",
            "Hiện thực nguyên mẫu",
            "Đánh giá bằng kịch bản thử nghiệm",
        ],
        "visual": "Hình 1.2 — quy trình nghiên cứu.",
        "image": "hinh_1_2_research_process.png",
        "table": None,
        "notes": (
            "Luận văn áp dụng phương pháp nghiên cứu ứng dụng: khảo sát bài toán livestream commerce, "
            "phân tích thách thức và literature, đề xuất giải pháp tích hợp, thiết kế kiến trúc tại Chương 3, "
            "hiện thực nguyên mẫu và đánh giá bằng kịch bản thử nghiệm có căn cứ tại Chương 4. "
            "Hình 1.2 thể hiện chuỗi logic xuyên suốt — hôm nay em dừng ở bước thiết kế; bước đánh giá là Thuyết trình 2. "
            "Mọi khẳng định kỹ thuật đều được đối chiếu với mã nguồn nguyên mẫu trước khi ghi vào luận văn."
        ),
        "transition": "Chương 2 formal hóa các thách thức xuất phát từ bài toán vừa nêu.",
        "minutes": 1.5,
    },
    {
        "id": "S7",
        "chapter": "2",
        "section": "2.2",
        "title": "Bốn thách thức T1–T4",
        "objective": "Chuyển bài toán thành bốn nhóm thách thức có thể map sang yêu cầu hệ thống.",
        "bullets": [
            "T1: Quá tải bình luận",
            "T2: Thiếu thử sản phẩm trực quan",
            "T3: Tín hiệu phi ngôn ngữ",
            "T4: Chức năng triển khai rời rạc",
        ],
        "visual": "Bảng 4 dòng T1–T4 (inline hoặc bảng đơn giản).",
        "image": None,
        "table": None,
        "notes": (
            "Chương 2 mục 2.2 formal hóa bốn thách thức. T1 — quá tải bình luận: người phát không kịp đọc và phản hồi. "
            "T2 — thiếu thử trực quan: người xem khó quyết định chỉ qua mô tả lời. "
            "T3 — tín hiệu phi ngôn ngữ: cử chỉ và khuôn mặt không vào quy trình nếu chỉ xử lý văn bản. "
            "T4 — triển khai rời rạc: AR, chatbot, nhận diện tách biệt, khó đánh giá end-to-end một phiên. "
            "Bốn nhóm này ánh xạ trực tiếp sang Bảng 3.1 và là tiêu chí mọi thiết kế Chương 3 phải trả lời."
        ),
        "transition": "Hai thách thức T2, T3 được giải quyết bởi trụ cột thị giác máy tính.",
        "minutes": 1.5,
    },
    {
        "id": "S8",
        "chapter": "2",
        "section": "2.3",
        "title": "Thị giác máy tính — vai trò hệ thống",
        "objective": "Giải thích vai trò CV trong phiên bán hàng, không đi sâu thuật toán.",
        "bullets": [
            "Thử sản phẩm AR trên trình duyệt",
            "Nhận diện khuôn mặt người xem",
            "Nhận dạng cử chỉ → bảng sự kiện",
            "Phục vụ T2 và T3",
        ],
        "visual": "Hình 2.2 — nhánh trụ cột CV (crop trái nếu cần).",
        "image": "hinh_2_2_hai_tru_cot_cong_nghe.png",
        "table": None,
        "notes": (
            "Trụ cột thị giác máy tính phục vụ ba nhu cầu nghiệp vụ trong phiên: thử sản phẩm trực quan bằng AR "
            "gắn sản phẩm ghim, nhận diện khuôn mặt người xem đã đăng ký, và nhận dạng cử chỉ thành sự kiện trên bảng AI. "
            "Em nhấn vai trò hỗ trợ quyết định mua và giảm gánh nặng quan sát thủ công cho người phát — "
            "không trình bày benchmark MediaPipe hay InsightFace tại đây; chi tiết thiết kế ở slide 16 và đánh giá ở Chương 4."
        ),
        "transition": "Thách thức T1 chủ yếu thuộc trụ cột xử lý ngôn ngữ.",
        "minutes": 1.5,
    },
    {
        "id": "S9",
        "chapter": "2",
        "section": "2.4–2.5",
        "title": "Xử lý ngôn ngữ — vai trò hệ thống",
        "objective": "Trình bày NLP và trợ lý như công cụ giảm tải bình luận T1.",
        "bullets": [
            "11 lớp ý định bình luận (Bảng 2.1)",
            "PhoBERT + TF-IDF = công cụ",
            "Trợ lý: AUTO · ESCALATE · IGNORE",
            "PhoBERT không phải đề tài",
        ],
        "visual": "Hình 2.2 nhánh NLP; bảng 2.1 rút gọn (3–4 lớp ví dụ).",
        "image": "hinh_2_2_hai_tru_cot_cong_nghe.png",
        "table": None,
        "notes": (
            "Trụ cột xử lý ngôn ngữ gồm hai bài toán tách bạch: phân loại ý định — mười một lớp theo nhu cầu "
            "livestream commerce tại Bảng 2.1 — và xác định sản phẩm được nhắc bằng TF-IDF. PhoBERT fine-tune "
            "phục vụ phân loại câu ngắn tiếng Việt. Kết quả đi vào trợ lý bán hàng với ba kiểu xử lý: "
            "đề xuất phản hồi tự động, leo thang cho người phát, hoặc bỏ qua spam. "
            "Điểm đóng góp domain là taxonomy và quy trình phiên — không phải mô hình ngôn ngữ mới."
        ),
        "transition": "Hai trụ cột hội tụ trong quy trình hỗ trợ bán hàng khái niệm.",
        "minutes": 1.5,
    },
    {
        "id": "S10",
        "chapter": "2",
        "section": "2.1, 2.5",
        "title": "Quy trình hỗ trợ bán hàng phiên",
        "objective": "Cho hội đồng thấy luồng nghiệp vụ tổng thể trước khi vào thiết kế.",
        "bullets": [
            "Người xem → phân tích → trợ lý",
            "Đa kênh: bình luận · AR · cử chỉ",
            "Phản hồi tự động hoặc leo thang",
            "Khép bằng mua hàng mô phỏng",
        ],
        "visual": "Hình 2.1 — quy trình khái niệm.",
        "image": "hinh_2_1_quy_trinh_ho_tro_ban_hang.png",
        "table": None,
        "notes": (
            "Hình 2.1 mô tả quy trình khái niệm: người xem tương tác qua bình luận, thử sản phẩm và tín hiệu hình ảnh; "
            "hệ thống ghi nhận và phân tích; trợ lý chuyển thành phản hồi hoặc leo thang; cuối cùng hỗ trợ chốt đơn mô phỏng. "
            "Người phát vẫn ra quyết định cuối — hệ thống giảm tải, không thay thế hoàn toàn. "
            "Quy trình này là xương sống preview cho kiến trúc Chương 3 và sẽ được nhắc lại ở slide tích hợp end-to-end."
        ),
        "transition": "Đặt đề xuất trong bối cảnh nghiên cứu liên quan.",
        "minutes": 1.5,
    },
    {
        "id": "S11",
        "chapter": "2",
        "section": "2.6",
        "title": "Nghiên cứu liên quan",
        "objective": "Chứng minh đề tài bám literature đã khảo sát, không mở rộng tùy tiện.",
        "bullets": [
            "Năm công trình tiêu biểu (Freeze v1.0)",
            "Livestream · chatbot · PhoBERT · AR · AI catalog",
            "Mỗi hướng có hạn chế riêng",
            "Chưa tích hợp trong một phiên",
        ],
        "visual": "Bảng 2.2 — đủ 5 hàng.",
        "image": None,
        "table": [
            ["Công trình", "Hạn chế chính"],
            ["Wongkitrungrueng 2020", "Không hỗ trợ người phát"],
            ["Følstad 2019", "Chat tĩnh, không livestream"],
            ["PhoBERT 2020", "Không domain livestream"],
            ["Hoffmann 2022", "AR tách phiên phát"],
            ["CommerceMM 2022", "Marketplace, không phiên"],
        ],
        "notes": (
            "Bảng 2.2 tổng hợp năm công trình đại diện đã khóa trong Literature Freeze. "
            "Wongkitrungrueng mô tả engagement người mua nhưng không lớp hỗ trợ kỹ thuật cho người phát. "
            "Følstad về UX chatbot trong ngữ cảnh chat tĩnh. PhoBERT mạnh NLP tiếng Việt chuẩn nhưng chưa có taxonomy bình luận bán hàng livestream. "
            "Hoffmann tổng hợp AR shopping nhưng chủ yếu kênh tách phiên. CommerceMM hướng marketplace đa phương thức, không mô hình phiên cho host. "
            "Điểm chung: thiếu mô tả POC tích hợp end-to-end trong một phiên bán hàng."
        ),
        "transition": "Từ hạn chế literature, em chỉ ra ba khoảng trống và ba đóng góp.",
        "minutes": 2.0,
    },
    {
        "id": "S12",
        "chapter": "2",
        "section": "2.6",
        "title": "Khoảng trống và đóng góp",
        "objective": "Neo vị trí luận văn: G1–G3 → Đ1–Đ3, làm cơ sở Chương 3.",
        "bullets": [
            "G1 → Đ1: Nguyên mẫu tích hợp (T4)",
            "G2 → Đ2: Quy trình phiên (T1, T2)",
            "G3 → Đ3: Taxonomy tiếng Việt (T1)",
            "Một phiên — một giao diện web",
        ],
        "visual": "Hình 2.3 — rời rạc vs tích hợp.",
        "image": "hinh_2_3_khoang_trong_nghien_cuu.png",
        "table": None,
        "notes": (
            "Ba khoảng trống: G1 tích hợp — các lớp AR, NLP, trợ lý nghiên cứu tách biệt; "
            "G2 bối cảnh phiên — công nghệ hướng chat tĩnh hoặc app, literature livestream thiên người mua; "
            "G3 domain NLP — thiếu taxonomy bình luận bán hàng tiếng Việt. "
            "Ba đóng góp tương ứng: Đ1 nguyên mẫu tích hợp trên web; Đ2 quy trình hỗ trợ gắn phiên phát trực tiếp; "
            "Đ3 mười một lớp ý định fine-tune PhoBERT kết hợp TF-IDF sản phẩm. "
            "Hình 2.3 trực quan hóa sự chuyển từ giải pháp rời rạc sang hệ thống đề xuất."
        ),
        "transition": "Chương 3 chuyển các đóng góp này thành thiết kế cụ thể.",
        "minutes": 1.5,
    },
    {
        "id": "S13",
        "chapter": "3",
        "section": "3.1",
        "title": "Giải pháp: nguyên mẫu tích hợp",
        "objective": "Chuyển tiếp sang Ch.3 — nhấn một phiên, một giao diện.",
        "bullets": [
            "Một giao diện phiên trên web",
            "CV + NLP + trợ lý đồng thời",
            "Mua hàng mô phỏng khép vòng",
            "Trả lời đóng góp Đ1",
        ],
        "visual": "Icon hoặc sơ đồ 4 khối hội tụ (không cần hình riêng).",
        "image": None,
        "table": None,
        "notes": (
            "Giải pháp đề xuất là nguyên mẫu thử nghiệm trên trình duyệt web, trong đó cùng một phiên livestream mô phỏng "
            "đồng thời có thử sản phẩm AR, nhận diện khuôn mặt và cử chỉ, phân tích bình luận, trợ lý bán hàng và quy trình mua hàng. "
            "Điểm then chốt là tích hợp — không phải demo từng công nghệ riêng lẻ. "
            "Phần tiếp theo em trình bày yêu cầu và kiến trúc chi tiết theo trục nghiệp vụ."
        ),
        "transition": "Thiết kế bắt đầu từ phân tích yêu cầu ánh xạ T1–T4.",
        "minutes": 0.75,
    },
    {
        "id": "S14",
        "chapter": "3",
        "section": "3.1",
        "title": "Phân tích yêu cầu hệ thống",
        "objective": "Chứng minh mọi chức năng thiết kế có nguồn gốc yêu cầu rõ ràng.",
        "bullets": [
            "Tác nhân: người xem · người phát",
            "YC-CN-01..08 map T1–T4",
            "YC-PNC: web · real-time · phiên tạm",
            "Luật dự phòng khi PhoBERT offline",
        ],
        "visual": "Bảng 3.1 rút gọn.",
        "image": None,
        "table": [
            ["Mã", "Yêu cầu", "T"],
            ["YC-CN-01", "Phân loại ý định", "T1"],
            ["YC-CN-03", "Thử sản phẩm AR", "T2"],
            ["YC-CN-05", "Nhận dạng cử chỉ", "T3"],
            ["YC-CN-06", "Trợ lý tích hợp", "T1,T4"],
        ],
        "notes": (
            "Bảng 3.1 liệt kê yêu cầu chức năng và phi chức năng. Hai tác nhân: người xem gửi tín hiệu đa kênh; "
            "người phát theo dõi trợ lý và quyết định chốt đơn. YC-CN-01, 02 giải quyết T1 về bình luận; "
            "03 AR cho T2; 04, 05 cho T3; 06 trợ lý hội tụ hai trụ cột và T4; 07 chat đồng bộ; 08 mua hàng mô phỏng. "
            "Yêu cầu phi chức năng giới hạn phạm vi POC: web-only, tương đối real-time, dữ liệu phiên tạm, luật dự phòng khi PhoBERT không sẵn sàng."
        ),
        "transition": "Yêu cầu trên được tổ chức trong kiến trúc tổng thể sau đây.",
        "minutes": 2.0,
    },
    {
        "id": "S15",
        "chapter": "3",
        "section": "3.2",
        "title": "Kiến trúc tổng thể hệ thống",
        "objective": "Trình bày kiến trúc nghiệp vụ — slide then chốt của phần thiết kế.",
        "bullets": [
            "Người xem đỉnh — người phát đáy",
            "Hệ thống hỗ trợ ở trung tâm",
            "Hai trụ cột AI phục vụ phân tích",
            "Không lấy stack làm trung tâm",
        ],
        "visual": "Hình 3.1 — kiến trúc nghiệp vụ.",
        "image": "hinh_3_1_kien_truc_tong_the.png",
        "table": None,
        "notes": (
            "Hình 3.1 mô tả kiến trúc theo góc nhìn nghiệp vụ: người xem tương tác qua lớp giao diện phiên; "
            "hệ thống hỗ trợ bán hàng thông minh ở trung tâm điều phối ghi nhận hình ảnh, phân tích bình luận và trợ lý; "
            "thành phần AI thực hiện CV và NLP; kết quả trả về người phát để ra quyết định. "
            "Em cố ý không vẽ React hay FastAPI làm trung tâm — đó là chi tiết triển khai ở slide 22. "
            "Đây là slide then chốt: mọi thiết kế chi tiết 3.3–3.7 là phóng to từ kiến trúc này."
        ),
        "transition": "Phóng to nhánh thị giác máy tính tại thiết kế xử lý hình ảnh.",
        "minutes": 2.5,
    },
    {
        "id": "S16",
        "chapter": "3",
        "section": "3.3",
        "title": "Thiết kế xử lý hình ảnh",
        "objective": "Giải thích ba nhánh song song từ camera đến bảng sự kiện AI.",
        "bullets": [
            "Ba nhánh song song từ camera",
            "AR thử sản phẩm theo ghim",
            "Khuôn mặt · cử chỉ qua máy chủ",
            "Hội tụ bảng sự kiện AI",
        ],
        "visual": "Hình 3.2 — luồng tín hiệu hình ảnh.",
        "image": "hinh_3_2_quy_trinh_xu_ly_tin_hieu_hinh_anh.png",
        "table": None,
        "notes": (
            "Thiết kế xử lý hình ảnh tách ba nhánh từ cùng camera người xem. Nhánh A: AR thử sản phẩm xử lý phía trình duyệt, "
            "ánh xạ hiệu ứng theo sản phẩm ghim. Nhánh B: gửi khung hình lên lớp máy chủ, InsightFace so khớp embedding đã đăng ký. "
            "Nhánh C: nhận dạng cử chỉ với cooldown chống spam sự kiện. "
            "Ba nhánh hội tụ bảng sự kiện AI để người phát theo dõi — giải quyết T2, T3. Chỉ số FPS và độ chính xác trình bày tại Chương 4."
        ),
        "transition": "Chiều ngôn ngữ được thiết kế tách hai nhánh độc lập.",
        "minutes": 2.0,
    },
    {
        "id": "S17",
        "chapter": "3",
        "section": "3.4",
        "title": "Xử lý bình luận — ý định",
        "objective": "Làm rõ pipeline phân loại ý định và vai trò PhoBERT.",
        "bullets": [
            "Chuẩn hóa → luật → PhoBERT",
            "Kết hợp lai theo độ tin cậy",
            "11 lớp ý định (Bảng 2.1)",
            "Luật dự phòng khi offline",
        ],
        "visual": "Hình 3.3 — không có TF-IDF.",
        "image": "hinh_3_3_quy_trinh_xac_dinh_y_dinh.png",
        "table": None,
        "notes": (
            "Nhánh ý định trả lời câu hỏi người xem muốn gì. Bình luận được chuẩn hóa, qua lớp luật sơ bộ, "
            "sau đó PhoBERT qua lớp máy chủ chuyển tiếp; kết quả lai ưu tiên mô hình khi đủ tin cậy. "
            "Đầu ra là một trong mười một lớp tại Bảng 2.1. Hình 3.3 cố ý dừng ở ý định — không vẽ sản phẩm hay trợ lý. "
            "Khi dịch vụ PhoBERT không phản hồi, luật dự phòng duy trì vận hành phiên."
        ),
        "transition": "Song song, nhánh thứ hai xác định sản phẩm được nhắc.",
        "minutes": 1.75,
    },
    {
        "id": "S18",
        "chapter": "3",
        "section": "3.4",
        "title": "Xử lý bình luận — sản phẩm",
        "objective": "Giải thích tách bạch TF-IDF và thang ưu tiên sản phẩm.",
        "bullets": [
            "TF-IDF trên catalog 10 SP",
            "Thang ưu tiên Bảng 3.2",
            "Không dùng PhoBERT",
            "Hội tụ tại trợ lý (H.3.5)",
        ],
        "visual": "Hình 3.4 + Bảng 3.2 rút gọn.",
        "image": "hinh_3_4_quy_trinh_xac_dinh_san_pham.png",
        "table": [
            ["Bước", "Nguồn xác định"],
            ["1", "Tên trực tiếp"],
            ["2", "TF-IDF semantic"],
            ["3", "Loại sản phẩm"],
            ["4", "Sản phẩm ghim"],
        ],
        "notes": (
            "Nhánh sản phẩm trả lời người xem đang nói về mặt hàng nào. TF-IDF so khớp bình luận với mô tả trong danh mục; "
            "Bảng 3.2 quy định thứ tự ưu tiên: tên trực tiếp, semantic search, khớp loại, sản phẩm ghim, cuối cùng làm rõ khi mơ hồ. "
            "Thiết kế tách bạch hai nhánh tránh nhầm ý định với sản phẩm — ví dụ câu chốt đơn cần cả hai kết quả chính xác. "
            "Hai nhánh chỉ gặp nhau tại trợ lý ở slide tiếp theo."
        ),
        "transition": "Trợ lý bán hàng là điểm hội tập duy nhất của hai nhánh NLP.",
        "minutes": 1.75,
    },
    {
        "id": "S19",
        "chapter": "3",
        "section": "3.5",
        "title": "Trợ lý bán hàng thông minh",
        "objective": "Trình bày logic AUTO/ESCALATE/IGNORE — slide then chốt thứ hai.",
        "bullets": [
            "Hợp nhất ý định + sản phẩm",
            "Luật nghiệp vụ → hành động",
            "AUTO · ESCALATE · IGNORE",
            "Phản hồi gắn ngữ cảnh sản phẩm",
        ],
        "visual": "Hình 3.5 — pipeline trợ lý.",
        "image": "hinh_3_5_quy_trinh_ho_tro_ban_hang.png",
        "table": None,
        "notes": (
            "Trợ lý nhận ý định từ Hình 3.3 và sản phẩm từ Hình 3.4, áp dụng luật nghiệp vụ theo Bảng 2.3. "
            "Câu hỏi giá có thể AUTO_REPLY_SUGGESTED; PURCHASE_INTENT và COMPLAINT leo thang ESCALATE_TO_HOST; "
            "spam IGNORE. Phản hồi mẫu gắn sản phẩm đã xác định, tránh trả lời chung chung. "
            "Thiết kế thiên thực dụng: không tự động hóa mọi bình luận nhạy cảm — phù hợp kỳ vọng Følstad về chuyển tiếp sang người thật."
        ),
        "transition": "Khi người xem chuyển sang hành động mua, quy trình mô phỏng đảm nhiệm.",
        "minutes": 2.5,
    },
    {
        "id": "S20",
        "chapter": "3",
        "section": "3.6",
        "title": "Quy trình mua hàng mô phỏng",
        "objective": "Khép vòng nghiệp vụ phiên bằng checkout mô phỏng trong phạm vi POC.",
        "bullets": [
            "Chọn SP → giỏ → form thanh toán",
            "COD hoặc QR giả lập",
            "Mã đơn LS-* · trạng thái đơn",
            "Dữ liệu chỉ trong phiên web",
        ],
        "visual": "Hình 3.6 — luồng mua hàng.",
        "image": "hinh_3_6_quy_trinh_mua_hang.png",
        "table": None,
        "notes": (
            "Quy trình mua hàng mô phỏng: chọn sản phẩm từ danh mục, ghim hoặc gợi ý trợ lý; thêm giỏ; mở form thanh toán; "
            "chọn COD hoặc thanh toán điện tử mô phỏng qua QR giả lập; nhận mã đơn LS và trạng thái cod_confirmed hoặc paid. "
            "Dữ liệu chỉ tồn tại trong phiên trình duyệt — không CSDL, không cổng thanh toán thật. "
            "Thiết kế này cho phép demo end-to-end mà vẫn tuân phạm vi Chương 1."
        ),
        "transition": "Trước khi vào triển khai, em tổng hợp luồng end-to-end một phiên.",
        "minutes": 1.5,
    },
    {
        "id": "S21",
        "chapter": "3",
        "section": "3.2, 3.8",
        "title": "Luồng end-to-end một phiên",
        "objective": "Nhấn tích hợp — trả lời câu hỏi vậy hệ thống chạy thế nào trong một phiên.",
        "bullets": [
            "Bình luận + CV + trợ lý + mua hàng",
            "Một phiên — không module rời",
            "Đối chiếu Hình 2.1",
            "Trả lời đóng góp Đ2",
        ],
        "visual": "Hình 2.1 (nhấn mũi tên tích hợp).",
        "image": "hinh_2_1_quy_trinh_ho_tro_ban_hang.png",
        "table": None,
        "notes": (
            "Slide này trả lời câu hỏi hội đồng thường gặp: các mảnh thiết kế có chạy cùng một phiên không. "
            "Em nhấn lại Hình 2.1: người xem vừa bình luận vừa thử AR vừa cử chỉ; hệ thống xử lý song song; "
            "trợ lý phản hồi; người xem có thể mua hàng mô phỏng — tất cả trong một giao diện phiên. "
            "Không lặp chi tiết slide 15 và 19; slide này khẳng định tính tích hợp end-to-end — cốt lõi đóng góp Đ2."
        ),
        "transition": "Cuối cùng, em trình bày cách nguyên mẫu được triển khai vật lý.",
        "minutes": 1.5,
    },
    {
        "id": "S22",
        "chapter": "3",
        "section": "3.7",
        "title": "Kiến trúc triển khai",
        "objective": "Liên kết thiết kế nghiệp vụ với triển khai POC reproducible.",
        "bullets": [
            "Lớp giao diện · máy chủ · PhoBERT",
            "REST + WebSocket (Bảng 3.4)",
            "Docker Compose tùy chọn",
            "Không ghi số port trên hình",
        ],
        "visual": "Hình 3.7 + Bảng 3.4 rút gọn.",
        "image": "hinh_3_7_kien_truc_trien_khai.png",
        "table": [
            ["Thành phần", "Kênh"],
            ["Chat phiên", "WebSocket"],
            ["API máy chủ", "REST"],
            ["PhoBERT", "REST predict-intent"],
        ],
        "notes": (
            "Kiến trúc triển khai bổ sung cho Hình 3.1 ở tầng vật lý: trình duyệt chạy lớp giao diện React; "
            "lớp máy chủ FastAPI điều phối chat WebSocket, nhận diện, chuyển tiếp NLP; dịch vụ PhoBERT riêng cho predict-intent. "
            "Docker Compose gói ba thành phần phục vụ thí nghiệm reproducible. "
            "Em cố ý không in số port trên Hình 3.7 — chi tiết cổng tại Bảng 3.4 và mục 4.1. Công nghệ §2.7 được nhắc tại đây, không giảng lại."
        ),
        "transition": "Tóm lại bảy mục thiết kế Chương 3 trước khi kết luận.",
        "minutes": 2.0,
    },
    {
        "id": "S23",
        "chapter": "3",
        "section": "3.8",
        "title": "Tóm tắt thiết kế Chương 3",
        "objective": "Recap có cấu trúc và nối sang đánh giá Chương 4.",
        "bullets": [
            "3.1 Yêu cầu · 3.2 Kiến trúc",
            "3.3–3.5 CV · NLP · Trợ lý",
            "3.6 Mua hàng · 3.7 Triển khai",
            "→ Map đánh giá Ch.4",
        ],
        "visual": "Danh sách 7 mục hoặc sơ đồ cây đơn giản.",
        "image": None,
        "table": None,
        "notes": (
            "Chương 3 đã chuyển T1–T4 và G1–G3 thành thiết kế cụ thể: yêu cầu Bảng 3.1, kiến trúc Hình 3.1, "
            "xử lý hình ảnh 3.2, bình luận hai nhánh 3.3–3.4, trợ lý 3.5, mua hàng 3.6, triển khai 3.7. "
            "Mỗi mục có hình hoặc bảng tương ứng làm bằng chứng thiết kế. "
            "Chương 4 sẽ hiện thực và đánh giá từng chức năng theo tiêu chí Bảng 1.1 — ngoài phạm vi trình bày hôm nay."
        ),
        "transition": "Kết luận phần trình bày và nêu kế hoạch tiếp theo.",
        "minutes": 1.0,
    },
    {
        "id": "S24",
        "chapter": "1,3",
        "section": "1.4, 3.8",
        "title": "Kết luận và kế hoạch tiếp theo",
        "objective": "Khép bài trình bày và định hướng Thuyết trình 2.",
        "bullets": [
            "Đã trình bày: bài toán · gap · thiết kế",
            "Nguyên mẫu tích hợp hai trụ cột",
            "Tiếp theo: hiện thực & đánh giá Ch.4",
            "Thuyết trình 2 · nộp luận văn",
        ],
        "visual": "Timeline 3 bước: P1 → P2 → nộp.",
        "image": None,
        "table": None,
        "notes": (
            "Tóm lại, luận văn hướng tới hệ thống hỗ trợ bán hàng tích hợp trong phiên livestream, "
            "lấp ba khoảng trống literature bằng nguyên mẫu web, quy trình phiên và taxonomy tiếng Việt. "
            "Hôm nay em trình bày thiết kế Chương 3; bước tiếp theo là hiện thực đầy đủ, chạy kịch bản thử nghiệm, "
            "đo metric PhoBERT, FPS AR và demo trực tiếp tại Thuyết trình 2. Em cảm ơn thầy cô đã lắng nghe."
        ),
        "transition": "Em sẵn sàng trao đổi và nhận ý kiến phản biện.",
        "minutes": 1.0,
    },
    {
        "id": "S25",
        "chapter": "—",
        "section": "—",
        "title": "Trao đổi và phản biện",
        "objective": "Mở không gian Q&A — không trình bày nội dung mới.",
        "bullets": [
            "Cảm ơn thầy cô và Hội đồng!",
            "Sẵn sàng trả lời câu hỏi",
        ],
        "visual": "Slide Q&A tối giản, logo trường.",
        "image": None,
        "table": None,
        "notes": (
            "Cảm ơn thầy cô trong Hội đồng và quý thầy cô phản biện. "
            "Em sẵn sàng trả lời các câu hỏi về thiết kế tích hợp, taxonomy ý định, phạm vi nguyên mẫu, "
            "hoặc kế hoạch đánh giá Chương 4. "
            "Các câu hỏi dự kiến: vì sao tách pipeline ý định/sản phẩm; dữ liệu huấn luyện PhoBERT; "
            "hạn chế mô phỏng thanh toán; so sánh với giải pháp thương mại."
        ),
        "transition": "—",
        "minutes": 0,
    },
]

# Thời lượng trình bày mục tiêu (S1–S24 ≈ 23,5 phút).
# Speaker notes = script đầy đủ (~90–120s/slide); khi rehearsal cắt theo cột TL.
_MINUTES_TARGET = {
    "S1": 0.5,
    "S2": 0.5,
    "S3": 1.5,
    "S4": 1.0,
    "S5": 1.0,
    "S6": 1.0,
    "S7": 1.0,
    "S8": 1.0,
    "S9": 1.0,
    "S10": 1.0,
    "S11": 1.5,
    "S12": 0.5,
    "S13": 0.5,
    "S14": 1.5,
    "S15": 2.0,
    "S16": 1.5,
    "S17": 1.0,
    "S18": 1.0,
    "S19": 2.0,
    "S20": 0.5,
    "S21": 0.5,
    "S22": 1.5,
    "S23": 0.5,
    "S24": 1.0,
    "S25": 0,
}
for _s in SLIDES:
    if _s["id"] in _MINUTES_TARGET:
        _s["minutes"] = _MINUTES_TARGET[_s["id"]]

FIGURE_MAP = [
    ("S3", "hinh_1_1_livestream_context.png", "Hình 1.1"),
    ("S6", "hinh_1_2_research_process.png", "Hình 1.2"),
    ("S8", "hinh_2_2_hai_tru_cot_cong_nghe.png", "Hình 2.2 (nhánh CV)"),
    ("S9", "hinh_2_2_hai_tru_cot_cong_nghe.png", "Hình 2.2 (nhánh NLP)"),
    ("S10", "hinh_2_1_quy_trinh_ho_tro_ban_hang.png", "Hình 2.1"),
    ("S12", "hinh_2_3_khoang_trong_nghien_cuu.png", "Hình 2.3"),
    ("S15", "hinh_3_1_kien_truc_tong_the.png", "Hình 3.1"),
    ("S16", "hinh_3_2_quy_trinh_xu_ly_tin_hieu_hinh_anh.png", "Hình 3.2"),
    ("S17", "hinh_3_3_quy_trinh_xac_dinh_y_dinh.png", "Hình 3.3"),
    ("S18", "hinh_3_4_quy_trinh_xac_dinh_san_pham.png", "Hình 3.4"),
    ("S19", "hinh_3_5_quy_trinh_ho_tro_ban_hang.png", "Hình 3.5"),
    ("S20", "hinh_3_6_quy_trinh_mua_hang.png", "Hình 3.6"),
    ("S21", "hinh_2_1_quy_trinh_ho_tro_ban_hang.png", "Hình 2.1 (E2E)"),
    ("S22", "hinh_3_7_kien_truc_trien_khai.png", "Hình 3.7"),
]

TOTAL_MINUTES = sum(s["minutes"] for s in SLIDES if s["id"] != "S25")
