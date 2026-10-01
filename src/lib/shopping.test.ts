import { describe, expect, it } from 'vitest'
import { aisleFor, euros, itemKey, parseItems } from './shopping'

describe('lista de la compra', () => {
  it('varias cosas de golpe con cantidades', () => {
    expect(parseItems('leche, 2 barras de pan y detergente')).toEqual([{ name: 'Leche' }, { name: 'Pan', qty: '2 barras' }, { name: 'Detergente' }])
    expect(parseItems('una docena de huevos; medio kilo de fresas\nyogures x6')).toEqual([
      { name: 'Huevos', qty: '1 docena' },
      { name: 'Fresas', qty: '½ kilo' },
      { name: 'Yogures', qty: '6' },
    ])
    expect(parseItems('un pan')).toEqual([{ name: 'Pan' }])
    expect(parseItems('3 latas de atún')).toEqual([{ name: 'Atún', qty: '3 latas' }])
  })
  it('cada cosa a su pasillo', () => {
    expect(aisleFor('Plátanos')).toBe('fruta')
    expect(aisleFor('Pasta de dientes')).toBe('higiene')
    expect(aisleFor('Macarrones')).toBe('despensa')
    expect(aisleFor('Tomate frito')).toBe('despensa')
    expect(aisleFor('Tomates')).toBe('fruta')
    expect(aisleFor('Papel higiénico')).toBe('higiene')
    expect(aisleFor('Leche de avena')).toBe('lacteos')
    expect(aisleFor('Pechugas de pollo')).toBe('carne')
    expect(aisleFor('Detergente')).toBe('limpieza')
    expect(aisleFor('Cervezas')).toBe('bebidas')
    expect(aisleFor('Tornillos')).toBe('otros')
  })
  it('lo aprendido manda y las claves ignoran plurales y acentos', () => {
    expect(itemKey('Plátanos')).toBe(itemKey('platano'))
    expect(aisleFor('Leche de avena', { [itemKey('leche de avena')]: 'bebidas' })).toBe('bebidas')
  })
})

describe('precios en la compra', () => {
  it('«leche 1,20 €» y otras formas, sin partir por la coma decimal', () => {
    expect(parseItems('leche 1,20 €, 2 barras de pan 0.80€ y aceite 6 euros')).toEqual([
      { name: 'Leche', price: 1.2 },
      { name: 'Pan', qty: '2 barras', price: 0.8 },
      { name: 'Aceite', price: 6 },
    ])
    expect(parseItems('pilas AA')).toEqual([{ name: 'Pilas AA' }])
    expect(euros(23.4)).toBe('23,40 €')
  })
})
