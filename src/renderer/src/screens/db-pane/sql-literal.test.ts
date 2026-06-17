import { describe, it, expect } from 'vitest'
import { escSingle, quoteIdent, literalOf } from './sql-literal'

describe('escSingle', () => {
  it('doubles single quotes', () => {
    expect(escSingle("O'Brien")).toBe("O''Brien")
  })
})

describe('quoteIdent', () => {
  it('double-quotes for postgres and backticks for mysql', () => {
    expect(quoteIdent('users', 'postgres')).toBe('"users"')
    expect(quoteIdent('users', 'mysql')).toBe('`users`')
  })
  it('quotes dotted names segment-by-segment', () => {
    expect(quoteIdent('public.users', 'postgres')).toBe('"public"."users"')
    expect(quoteIdent('db.tbl', 'mysql')).toBe('`db`.`tbl`')
  })
  it('strips pre-existing quoting and escapes embedded quotes', () => {
    expect(quoteIdent('"weird"', 'postgres')).toBe('"weird"')
    expect(quoteIdent('a"b', 'postgres')).toBe('"a""b"')
    expect(quoteIdent('a`b', 'mysql')).toBe('`a``b`')
  })
})

describe('literalOf', () => {
  it('emits NULL for null/undefined', () => {
    expect(literalOf(null, 'text')).toBe('NULL')
    expect(literalOf(undefined, 'text')).toBe('NULL')
  })
  it('passes numbers and bigints through unquoted', () => {
    expect(literalOf(42, 'int')).toBe('42')
    expect(literalOf(10n, 'bigint')).toBe('10')
  })
  it('maps booleans to TRUE/FALSE', () => {
    expect(literalOf(true, 'bool')).toBe('TRUE')
    expect(literalOf(false, 'bool')).toBe('FALSE')
  })
  it('coerces numeric-typed string values', () => {
    expect(literalOf('123', 'integer')).toBe('123')
    expect(literalOf('', 'integer')).toBe('NULL')
    expect(literalOf('abc', 'integer')).toBe("'abc'")
  })
  it('coerces boolean-typed string values', () => {
    expect(literalOf('t', 'boolean')).toBe('TRUE')
    expect(literalOf('0', 'boolean')).toBe('FALSE')
  })
  it('single-quotes and escapes plain text', () => {
    expect(literalOf("O'Brien", 'text')).toBe("'O''Brien'")
  })
})
