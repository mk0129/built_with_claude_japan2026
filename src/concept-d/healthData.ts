export type VitalValues = {
  temperature?: number
  systolic?: number
  diastolic?: number
  pulse?: number
  spo2?: number
}

export type SymptomEntry = {
  severity: 0 | 1 | 2 | 3 | 4
  count?: number
  location?: string
  interference?: string
  customName?: string
}

export type HealthRecord = {
  id: string
  measuredAt: string
  vitals: VitalValues
  symptoms: Record<string, SymptomEntry>
}

export type SymptomDefinition = {
  id: string
  name: string
  category: string
  ctcaeReference: string
  detailType?: "count" | "location"
}

export const previousVisitDate = "2025-05-23"
export const currentVisitDate = "2025-06-20"

export const severityLabels = [
  "なし",
  "軽い",
  "中くらい",
  "強い",
  "非常に強い",
] as const

export const symptomLibrary: SymptomDefinition[] = [
  {
    id: "fatigue",
    name: "だるさ・倦怠感",
    category: "全身・精神・睡眠",
    ctcaeReference: "Fatigue",
  },
  {
    id: "hotFlash",
    name: "発汗・ほてり",
    category: "全身・精神・睡眠",
    ctcaeReference: "Hot flashes",
  },
  {
    id: "insomnia",
    name: "不眠",
    category: "全身・精神・睡眠",
    ctcaeReference: "Insomnia",
  },
  {
    id: "anxiety",
    name: "不安",
    category: "全身・精神・睡眠",
    ctcaeReference: "Anxiety",
  },
  {
    id: "depressedMood",
    name: "気分の落ち込み",
    category: "全身・精神・睡眠",
    ctcaeReference: "Depression",
  },
  {
    id: "nausea",
    name: "吐き気",
    category: "消化器",
    ctcaeReference: "Nausea",
  },
  {
    id: "vomiting",
    name: "嘔吐",
    category: "消化器",
    ctcaeReference: "Vomiting",
    detailType: "count",
  },
  {
    id: "diarrhea",
    name: "下痢",
    category: "消化器",
    ctcaeReference: "Diarrhea",
    detailType: "count",
  },
  {
    id: "constipation",
    name: "便秘",
    category: "消化器",
    ctcaeReference: "Constipation",
  },
  {
    id: "appetite",
    name: "食欲低下",
    category: "消化器",
    ctcaeReference: "Anorexia",
  },
  {
    id: "mucositis",
    name: "口内炎",
    category: "消化器",
    ctcaeReference: "Oral mucositis",
  },
  {
    id: "taste",
    name: "味覚の変化",
    category: "消化器",
    ctcaeReference: "Dysgeusia",
  },
  {
    id: "abdominalPain",
    name: "腹痛",
    category: "消化器",
    ctcaeReference: "Abdominal pain",
    detailType: "location",
  },
  {
    id: "numbness",
    name: "手足のしびれ",
    category: "神経・筋骨格",
    ctcaeReference: "Peripheral sensory neuropathy",
  },
  {
    id: "dizziness",
    name: "めまい",
    category: "神経・筋骨格",
    ctcaeReference: "Dizziness",
  },
  {
    id: "headache",
    name: "頭痛",
    category: "神経・筋骨格",
    ctcaeReference: "Headache",
    detailType: "location",
  },
  {
    id: "jointPain",
    name: "関節痛",
    category: "神経・筋骨格",
    ctcaeReference: "Arthralgia",
    detailType: "location",
  },
  {
    id: "musclePain",
    name: "筋肉痛",
    category: "神経・筋骨格",
    ctcaeReference: "Myalgia",
    detailType: "location",
  },
  {
    id: "otherPain",
    name: "その他の痛み",
    category: "神経・筋骨格",
    ctcaeReference: "Pain",
    detailType: "location",
  },
  { id: "rash", name: "皮疹・発疹", category: "皮膚", ctcaeReference: "Rash" },
  { id: "itch", name: "かゆみ", category: "皮膚", ctcaeReference: "Pruritus" },
  {
    id: "handFoot",
    name: "手足症候群に関連する症状",
    category: "皮膚",
    ctcaeReference: "Palmar-plantar erythrodysesthesia",
  },
  {
    id: "drySkin",
    name: "皮膚の乾燥",
    category: "皮膚",
    ctcaeReference: "Dry skin",
  },
  {
    id: "dyspnea",
    name: "息切れ",
    category: "呼吸器・循環器",
    ctcaeReference: "Dyspnea",
  },
  {
    id: "cough",
    name: "咳",
    category: "呼吸器・循環器",
    ctcaeReference: "Cough",
  },
  {
    id: "palpitations",
    name: "動悸",
    category: "呼吸器・循環器",
    ctcaeReference: "Palpitations",
  },
  {
    id: "edema",
    name: "むくみ",
    category: "その他",
    ctcaeReference: "Edema limbs",
  },
  {
    id: "dysuria",
    name: "排尿時の痛み",
    category: "その他",
    ctcaeReference: "Urinary tract pain",
  },
  {
    id: "frequency",
    name: "頻尿",
    category: "その他",
    ctcaeReference: "Urinary frequency",
  },
]

export const initialActiveSymptomIds = [
  "fatigue",
  "nausea",
  "numbness",
  "jointPain",
  "hotFlash",
]

export const initialHealthRecords: HealthRecord[] = [
  {
    id: "r01",
    measuredAt: "2025-05-24T08:10",
    vitals: {
      temperature: 36.4,
      systolic: 122,
      diastolic: 76,
      pulse: 72,
      spo2: 98,
    },
    symptoms: {
      fatigue: { severity: 1 },
      nausea: { severity: 0 },
      numbness: { severity: 0 },
    },
  },
  {
    id: "r02",
    measuredAt: "2025-05-26T07:55",
    vitals: {
      temperature: 36.5,
      systolic: 119,
      diastolic: 74,
      pulse: 70,
      spo2: 98,
    },
    symptoms: {
      fatigue: { severity: 1 },
      nausea: { severity: 1 },
      numbness: { severity: 0 },
    },
  },
  {
    id: "r03",
    measuredAt: "2025-05-29T20:15",
    vitals: { temperature: 36.7, pulse: 78, spo2: 97 },
    symptoms: {
      fatigue: { severity: 2 },
      nausea: { severity: 1 },
      hotFlash: { severity: 1 },
    },
  },
  {
    id: "r04",
    measuredAt: "2025-05-31T08:22",
    vitals: {
      temperature: 36.6,
      systolic: 126,
      diastolic: 78,
      pulse: 75,
      spo2: 98,
    },
    symptoms: {
      fatigue: { severity: 2 },
      nausea: { severity: 0 },
      numbness: { severity: 1 },
    },
  },
  {
    id: "r05",
    measuredAt: "2025-06-02T19:40",
    vitals: { temperature: 36.8, systolic: 128, diastolic: 80, pulse: 82 },
    symptoms: {
      fatigue: { severity: 2 },
      nausea: { severity: 1 },
      numbness: { severity: 1 },
      jointPain: { severity: 1, location: "両手の指" },
    },
  },
  {
    id: "r06",
    measuredAt: "2025-06-04T08:05",
    vitals: {
      temperature: 36.5,
      systolic: 121,
      diastolic: 75,
      pulse: 74,
      spo2: 98,
    },
    symptoms: {
      fatigue: { severity: 1 },
      nausea: { severity: 0 },
      numbness: { severity: 1 },
      jointPain: { severity: 1 },
    },
  },
  {
    id: "r07",
    measuredAt: "2025-06-06T21:10",
    vitals: { temperature: 36.9, pulse: 84, spo2: 97 },
    symptoms: {
      fatigue: { severity: 2 },
      nausea: { severity: 1 },
      numbness: { severity: 2 },
      hotFlash: { severity: 2 },
    },
  },
  {
    id: "r08",
    measuredAt: "2025-06-08T08:35",
    vitals: {
      temperature: 36.6,
      systolic: 124,
      diastolic: 77,
      pulse: 76,
      spo2: 98,
    },
    symptoms: {
      fatigue: { severity: 1 },
      nausea: { severity: 0 },
      numbness: { severity: 2 },
      jointPain: { severity: 1 },
    },
  },
  {
    id: "r09",
    measuredAt: "2025-06-10T20:00",
    vitals: {
      temperature: 36.7,
      systolic: 129,
      diastolic: 81,
      pulse: 80,
      spo2: 97,
    },
    symptoms: {
      fatigue: { severity: 2 },
      nausea: { severity: 0 },
      numbness: { severity: 2 },
      jointPain: { severity: 2, location: "両ひざ" },
    },
  },
  {
    id: "r10",
    measuredAt: "2025-06-12T08:18",
    vitals: {
      temperature: 36.5,
      systolic: 120,
      diastolic: 73,
      pulse: 71,
      spo2: 98,
    },
    symptoms: {
      fatigue: { severity: 1 },
      nausea: { severity: 0 },
      numbness: { severity: 2 },
      hotFlash: { severity: 1 },
    },
  },
  {
    id: "r11",
    measuredAt: "2025-06-13T20:45",
    vitals: {
      temperature: 36.8,
      systolic: 132,
      diastolic: 82,
      pulse: 85,
      spo2: 97,
    },
    symptoms: {
      fatigue: { severity: 2 },
      numbness: { severity: 3, interference: "ボタンを留めにくい" },
      jointPain: { severity: 2 },
      rash: { severity: 1 },
    },
  },
  {
    id: "r12",
    measuredAt: "2025-06-15T09:05",
    vitals: {
      temperature: 36.6,
      systolic: 125,
      diastolic: 78,
      pulse: 77,
      spo2: 98,
    },
    symptoms: {
      fatigue: { severity: 2 },
      nausea: { severity: 0 },
      numbness: { severity: 3 },
      jointPain: { severity: 1 },
    },
  },
  {
    id: "r13",
    measuredAt: "2025-06-17T19:55",
    vitals: { temperature: 36.7, pulse: 79, spo2: 97 },
    symptoms: {
      fatigue: { severity: 1 },
      nausea: { severity: 0 },
      numbness: { severity: 2 },
      jointPain: { severity: 1 },
    },
  },
  {
    id: "r14",
    measuredAt: "2025-06-19T08:12",
    vitals: {
      temperature: 36.5,
      systolic: 123,
      diastolic: 76,
      pulse: 73,
      spo2: 98,
    },
    symptoms: {
      fatigue: { severity: 1 },
      nausea: { severity: 0 },
      numbness: { severity: 2 },
      jointPain: { severity: 1 },
      hotFlash: { severity: 1 },
    },
  },
]

export const intervisitEvents = [
  {
    date: "2025-05-23",
    type: "visit",
    title: "前回外来",
    detail: "確認済みの外来日",
  },
  {
    date: "2025-05-24",
    type: "learning",
    title: "教材が処方された",
    detail: "ホルモン療法を始める前に",
  },
  {
    date: "2025-05-29",
    type: "symptom",
    title: "倦怠感を「中くらい」と記録",
    detail: "自己申告値 2 / 4",
  },
  {
    date: "2025-06-10",
    type: "learning",
    title: "教材を学習完了",
    detail: "病理結果の見かた",
  },
  {
    date: "2025-06-13",
    type: "symptom",
    title: "手足のしびれを「強い」と記録",
    detail: "自己申告値 3 / 4",
  },
  {
    date: "2025-06-14",
    type: "question",
    title: "しびれに関する質問を保存",
    detail: "手のしびれは治療が終われば戻りますか？",
  },
  {
    date: "2025-06-20",
    type: "visit",
    title: "今回の診察",
    detail: "一時共有で振り返り",
  },
] as const

export function formatShortDate(value: string) {
  const date = new Date(value)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

export function symptomName(id: string) {
  return symptomLibrary.find((item) => item.id === id)?.name || id
}
