import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseQuestions, splitOptions, stripPrefixes, resolveAnswer, dedupe, nameFromFile, letterOf, SAMPLE_CSV,
} from '../js/core/quiz-import.js';

const EXAMPLE = "O objeto da contabilidade é: | [’A - Patrimonio’,’B - Lucro’,’C - Os ativos’,’D - As aziendas’,’E - As demonstrações contábeis’] | A | Segundo a CPC 00, o objeto da contabilidade é o patrimônio";

test('lê o exemplo do enunciado (| e aspas curvas)', () => {
  const r = parseQuestions(EXAMPLE);
  assert.equal(r.delimiter, '|');
  assert.equal(r.skipped.length, 0);
  assert.deepEqual(r.questions, [{
    question: 'O objeto da contabilidade é:',
    options: ['Patrimonio', 'Lucro', 'Os ativos', 'As aziendas', 'As demonstrações contábeis'],
    answer: 0,
    explanation: 'Segundo a CPC 00, o objeto da contabilidade é o patrimônio',
  }]);
});

test('ignora cabeçalho e linhas em branco; lê o modelo', () => {
  const r = parseQuestions(SAMPLE_CSV + '\n\n');
  assert.equal(r.questions.length, 3);
  assert.equal(r.skipped.length, 0);
  assert.deepEqual(r.questions[2].options, ['Certo', 'Errado']);
  assert.equal(r.questions[1].answer, 1);
});

test('CSV com vírgula e campo entre aspas duplas (Excel)', () => {
  const csv = 'pergunta,opcoes,resposta,explicacao\n'
    + '"Qual, afinal?","[\'A - Um, dois\',\'B - Três\']",B,"Porque sim, ora"\n';
  const r = parseQuestions(csv);
  assert.equal(r.delimiter, ',');
  assert.deepEqual(r.questions[0], { question: 'Qual, afinal?', options: ['Um, dois', 'Três'], answer: 1, explanation: 'Porque sim, ora' });
});

test('CSV com vírgula sem aspas externas: remonta a lista de opções', () => {
  const r = parseQuestions("Capital do Brasil?,['Rio','Brasília','Salvador'],Brasília,Desde 1960, quando foi inaugurada\n");
  assert.equal(r.questions.length, 1);
  assert.deepEqual(r.questions[0].options, ['Rio', 'Brasília', 'Salvador']);
  assert.equal(r.questions[0].answer, 1);
  assert.equal(r.questions[0].explanation, 'Desde 1960, quando foi inaugurada');
});

test('tab e ponto e vírgula; aspas duplas na lista; resposta numérica', () => {
  const tsv = 'P1\t["A) x", "B) y", "C) z"]\t3\tE1\n';
  const r1 = parseQuestions(tsv);
  assert.equal(r1.delimiter, '\t');
  assert.deepEqual(r1.questions[0].options, ['x', 'y', 'z']);
  assert.equal(r1.questions[0].answer, 2);
  const r2 = parseQuestions("P2;['a','b'];b;\n");
  assert.equal(r2.delimiter, ';');
  assert.equal(r2.questions[0].answer, 1);
  assert.equal(r2.questions[0].explanation, '');
});

test('splitOptions: apóstrofo dentro do item, JSON, lista sem aspas', () => {
  assert.deepEqual(splitOptions("['A - Caixa d'água','B - Rio']"), ['A - Caixa d\'água', 'B - Rio']);
  assert.deepEqual(splitOptions('["x", "y"]'), ['x', 'y']);
  assert.deepEqual(splitOptions('[A) um, dois; B) três]'), ['A) um, dois', 'B) três']);
  assert.deepEqual(splitOptions('[x, y, z]'), ['x', 'y', 'z']);
  assert.deepEqual(splitOptions(''), []);
});

test('stripPrefixes só tira quando todas têm letra em ordem crescente', () => {
  assert.deepEqual(stripPrefixes(['A - x', 'B - y']), { texts: ['x', 'y'], letters: ['A', 'B'] });
  assert.deepEqual(stripPrefixes(['C - Certo', 'E - Errado']), { texts: ['Certo', 'Errado'], letters: ['C', 'E'] });
  assert.deepEqual(stripPrefixes(['E - x', 'C - y']).letters, null);
  assert.deepEqual(stripPrefixes(['A.C. Milan', 'Inter']).texts, ['A.C. Milan', 'Inter']);
});

test('Certo/Errado com letras C e E (estilo Cespe), CSV todo entre aspas', () => {
  const csv = '"pergunta"|"opcoes"|"resposta"|"explicacao"\n'
    + '"Receitas aumentam o PL."|"[""C - Certo"",""E - Errado""]"|"C"|"Sim."\n'
    + '"Despesas aumentam o PL."|"[""C - Certo"",""E - Errado""]"|"E"|"Não."\n'
    + '"O objeto é:"|"[""A - o patrimônio."",""B - o lucro.""]"|"A"|""\n';
  const r = parseQuestions(csv);
  assert.equal(r.skipped.length, 0);
  assert.deepEqual(r.questions.map((q) => [q.options, q.answer, q.letters]), [
    [['Certo', 'Errado'], 0, ['C', 'E']],
    [['Certo', 'Errado'], 1, ['C', 'E']],
    [['o patrimônio.', 'o lucro.'], 0, undefined], // letras padrão não são guardadas
  ]);
  assert.equal(letterOf(r.questions[1], 1), 'E');
  assert.equal(letterOf(r.questions[2], 1), 'B');
});

test('resolveAnswer: letra, "Letra B", texto com prefixo, texto', () => {
  const raw = ['A - Patrimônio', 'B - Lucro'];
  const texts = ['Patrimônio', 'Lucro'];
  assert.equal(resolveAnswer('a', raw, texts), 0);
  assert.equal(resolveAnswer('Letra B', raw, texts), 1);
  assert.equal(resolveAnswer('B - Lucro', raw, texts), 1);
  assert.equal(resolveAnswer('patrimonio', raw, texts), 0);
  assert.equal(resolveAnswer('C', raw, texts), -1);
  assert.equal(resolveAnswer('', raw, texts), -1);
});

test('linhas inválidas são relatadas com o número da linha', () => {
  const text = [
    "Ok?|['A - s','B - n']|A|",
    "Uma só?|['A - s']|A|",
    "Seis?|['1','2','3','4','5','6']|A|",
    "Sem resposta?|['A - s','B - n']|Z|",
  ].join('\n');
  const r = parseQuestions(text);
  assert.equal(r.questions.length, 1);
  assert.deepEqual(r.skipped.map((s) => s.line), [2, 3, 4]);
  assert.match(r.skipped[0].reason, /menos de 2/);
  assert.match(r.skipped[1].reason, /mais de 5/);
  assert.match(r.skipped[2].reason, /não corresponde/);
});

test('BOM, CRLF e \\n literal na explicação', () => {
  const r = parseQuestions("﻿P?|['a','b']|a|linha 1\\nlinha 2\r\nQ?|['a','b']|b|\r\n");
  assert.equal(r.questions.length, 2);
  assert.equal(r.questions[0].explanation, 'linha 1\nlinha 2');
});

test('dedupe ignora maiúsculas, acentos e espaços', () => {
  const qs = [{ question: 'Olá  mundo' }, { question: 'ola mundo' }, { question: 'Outra' }];
  const { toAdd, duplicates } = dedupe(qs, [{ question: 'OUTRA' }]);
  assert.equal(toAdd.length, 1);
  assert.equal(duplicates.length, 2);
});

test('nameFromFile', () => {
  assert.equal(nameFromFile('Contabilidade_Geral.csv'), 'Contabilidade_Geral');
  assert.equal(nameFromFile('00_Aula 1.1 (1).csv'), '00_Aula 1.1 (1)');
});
