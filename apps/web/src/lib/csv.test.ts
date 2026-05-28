import { describe, it, expect } from 'vitest';
import { parseCSV } from './csv';

describe('parseCSV', () => {
  it('parse une ligne simple avec virgules', () => {
    expect(parseCSV('a,b,c')).toEqual([['a', 'b', 'c']]);
  });

  it('parse plusieurs lignes', () => {
    expect(parseCSV('a,b\n1,2\n3,4')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('détecte automatiquement le séparateur point-virgule', () => {
    expect(parseCSV('a;b;c\n1;2;3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('gère les guillemets avec virgules à l’intérieur', () => {
    expect(parseCSV('name,address\n"Bob","12, rue X"')).toEqual([
      ['name', 'address'],
      ['Bob', '12, rue X'],
    ]);
  });

  it('gère les guillemets échappés ""', () => {
    expect(parseCSV('note\n"Il a dit ""bonjour"""')).toEqual([
      ['note'],
      ['Il a dit "bonjour"'],
    ]);
  });

  it('strip le BOM UTF-8 en début de fichier', () => {
    const withBom = '﻿a,b\n1,2';
    expect(parseCSV(withBom)).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('gère les fins de ligne CRLF', () => {
    expect(parseCSV('a,b\r\n1,2\r\n3,4')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('ignore les lignes complètement vides', () => {
    expect(parseCSV('a,b\n\n1,2\n\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('gère la dernière ligne sans \\n final', () => {
    expect(parseCSV('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('retourne [] sur input vide ou whitespace', () => {
    expect(parseCSV('')).toEqual([]);
    expect(parseCSV('  \n  \n')).toEqual([]);
  });

  it('gère les cellules vides entre séparateurs', () => {
    expect(parseCSV('a,,b\n,1,')).toEqual([
      ['a', '', 'b'],
      ['', '1', ''],
    ]);
  });

  it('parse un CSV scolaire réaliste (cas de prod)', () => {
    const csv = `type,firstName,lastName,birthDate,email
STUDENT,Karim,Berrada,2012-03-14,
STUDENT,"Lina","Tahiri-El Hassani",2012-09-02,parent@exemple.ma
STUDENT,Hicham,Fassi,2013-01-21,`;
    const rows = parseCSV(csv);
    expect(rows).toHaveLength(4);
    expect(rows[2]?.[2]).toBe('Tahiri-El Hassani');
    expect(rows[3]?.[3]).toBe('2013-01-21');
  });
});
