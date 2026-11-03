// zoom: نسبة التكبير عند تنفيذ الخطوة (الافتراضي 1.6)، أو false لتعطيله
type Zoomable = { zoom?: number | false };

// speech: نص التعليق الصوتي إن اختلف عن الشريط المكتوب (الافتراضي: narration بعد حذف الإنجليزية بين الأقواس)
export type Step = (
  | { action: "goto"; url: string; narration?: string }
  | ({ action: "click"; selector: string; narration?: string } & Zoomable)
  | ({ action: "fill"; selector: string; value: string; narration?: string; clear?: boolean; submit?: boolean } & Zoomable) // submit: Enter بعد الكتابة // clear: يفرغ الحقل أولًا (قيم افتراضية يضيفها النظام)
  | ({ action: "select"; selector: string; label: string; narration?: string } & Zoomable) // قائمة <select>: اختيار بالنص الظاهر
  | { action: "hide"; selector: string; narration?: string } // إخفاء عنصر مزعج (إشعارات)
  | { action: "wait"; ms: number; narration?: string }
  | ({ action: "point"; selector: string; narration?: string } & Zoomable) // يشير المؤشر إلى عنصر ويحدّده بإطار (وتكبير للصغير) دون أي تفاعل: لما يشرحه المقدّم
  | { action: "press"; key: string; narration?: string } // ضغطة مفتاح (مثل Enter بعد كتابة البحث)
) & { speech?: string; caption?: string }; // caption: نص قصير يُعرض على الشاشة (للمزايا الرئيسية) حين يكون scenario.keyCaptions

export interface Scenario {
  id: string;
  title: { ar: string; en: string };
  baseUrl?: string;
  intro?: string; // جملة تُقال فوق بطاقة العنوان
  outro?: string; // جملة تُقال فوق بطاقة الختام
  card?: { episode?: { n: number; total: number }; points?: string[]; series?: string; epLabel?: string; epTitle?: string }; // عناصر بطاقتي العنوان والختام (خريطة الحلقات وأهداف التعلّم)
  nextTitle?: string; // عنوان الحلقة التالية، يظهر في بطاقة الختام
  // تسجيل دخول في الخلفية قبل بدء التسجيل (لا يظهر في الفيديو). القيم تدعم ${ENV_VAR}
  login?: {
    url: string;
    user: { selector: string; value: string };
    password: { selector: string; value: string };
    submit: string;
    ready: string; // عنصر يدل على نجاح الدخول
  };
  // متغيرات تُحسب قبل التسجيل (تتطلب login) وتُستعمل كـ ${NAME} في قيم الكتابة:
  // أول قيمة رقمية غير مستخدمة في model.field ابتداءً من start، فلا يتكرر الكود بين التسجيلات
  vars?: Record<string, { model: string; field: string; start: number; prefix?: string }>; // prefix: النص الثابت قبل الرقم في القيمة المخزنة (مثل "Sales Tax ")
  // الصفحة التي يبدأ منها الفيديو (خلف بطاقة العنوان)
  start?: { url: string; ready?: string };
  hide?: string[]; // عناصر تُخفى طوال الفيديو (مثل إشعارات)
  verify?: Verify[]; // فحوص النتيجة بعد آخر خطوة؛ فشلها = خروج بالرمز 3 مع حفظ الفيديو
  keyCaptions?: boolean; // true: يُعرض في مربع الشرح caption فقط (المزايا الرئيسية) بدل نص التعليق الصوتي كاملًا
  steps: Step[];
}

export interface RecordedEvent {
  stepIndex: number;
  action: Step["action"];
  tMs: number; // وقت بدء الخطوة نسبةً لبداية التسجيل
  endMs: number;
  box?: { x: number; y: number; width: number; height: number };
  narration?: string;
  audio?: { file: string; startMs: number }; // مقطع التعليق الصوتي ووقت بدئه في الفيديو
}

// تحقق من نتيجة الحلقة بعد آخر خطوة (اختياري، يستعمله الطابور): إما عنصر ظاهر في الشاشة أو سجل أُنشئ فعلًا في النظام
export interface Verify {
  kind: "visible" | "record";
  selector?: string; // visible
  model?: string; // record: يتحقق عبر JSON-RPC أن السجل أُنشئ فعلًا
  domain?: unknown[]; // يدعم ${VAR}
  note: string;
}
export interface VerifyResult { note: string; ok: boolean; detail?: string; ids?: number[]; model?: string }
