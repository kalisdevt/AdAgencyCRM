// Сумма прописью для счета: 12500.5 → «Двенадцать тысяч пятьсот рублей 50 копеек»

const ONES = {
  m: ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'],
  f: ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'],
}
const TEENS = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать',
  'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать']
const TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто']
const HUNDREDS = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот']

// Разряды: род числительного и формы слова для 1, 2–4, 5+
const SCALES = [
  { gender: 'm', forms: ['рубль', 'рубля', 'рублей'] },
  { gender: 'f', forms: ['тысяча', 'тысячи', 'тысяч'] },
  { gender: 'm', forms: ['миллион', 'миллиона', 'миллионов'] },
  { gender: 'm', forms: ['миллиард', 'миллиарда', 'миллиардов'] },
]

export function plural(number, [one, few, many]) {
  const n = Math.abs(number) % 100
  if (n >= 11 && n <= 19) return many
  const last = n % 10
  if (last === 1) return one
  if (last >= 2 && last <= 4) return few
  return many
}

function triad(number, gender) {
  const words = [HUNDREDS[Math.floor(number / 100)]]
  const rest = number % 100
  if (rest >= 10 && rest < 20) words.push(TEENS[rest - 10])
  else words.push(TENS[Math.floor(rest / 10)], ONES[gender][rest % 10])
  return words.filter(Boolean)
}

export function amountInWords(amount) {
  const kopecks = Math.round(amount * 100)
  let rubles = Math.floor(kopecks / 100)
  const cents = kopecks % 100

  const parts = []
  if (rubles === 0) parts.push('ноль', 'рублей')
  for (let scale = 0; rubles > 0 && scale < SCALES.length; scale += 1) {
    const value = rubles % 1000
    rubles = Math.floor(rubles / 1000)
    const { gender, forms } = SCALES[scale]
    // слово «рублей» нужно всегда, даже если младший разряд нулевой (1 000 рублей)
    if (value === 0 && scale > 0) continue
    parts.unshift(...triad(value, gender), plural(value, forms))
  }
  const text = `${parts.join(' ')} ${String(cents).padStart(2, '0')} ${plural(cents, ['копейка', 'копейки', 'копеек'])}`
  return text.charAt(0).toUpperCase() + text.slice(1)
}
