-- 0069: nome exato do técnico como aparece no relatório do SGP — chave de
-- casamento das OS (os auxiliares vêm concatenados sem separador, então o
-- match é por substring do nome completo normalizado).
alter table tecnicos add column if not exists nome_sgp text;
update tecnicos set nome_sgp = v.n from (values
  ('Adriano Silva', 'Adriano dos Santos Silva'),
  ('Adriano Oliveira', 'Adriano de oliveira santos'),
  ('Cleyson Castro', 'Cleyson Castro'),
  ('Edinaldo Nunes', 'Edinaldo Nunes'),
  ('Lucas Goes', 'Lucas Oliveira de Goes'),
  ('Laercio Gadelha', 'Laercio Gadelha'),
  ('Hitalo Adrison', 'Hitalo Sousa'),
  ('Raygleison Luciano', 'Rayglaison Luciano do nascimento Santos'),
  ('Fabricio Soares', 'Fabricio Warlisson Silva Soares'),
  ('Jonas Freitas', 'JONAS DE SOUZA FREITAS'),
  ('Welison Costa', 'Welison Costa dos Santos'),
  ('Milton Aparecido', 'Milton Aparecido')
) as v(nome, n) where tecnicos.nome = v.nome;
