-- 0045: agendamentos das OS estavam 3h adiantados no banco.
-- O SGP envia a hora local de Santarém (UTC-3) sem fuso; gravávamos direto num
-- timestamptz e o Postgres assumia UTC — o agendamento das 09:30 virava 09:30Z
-- e a tela (que converte para UTC-3) mostrava 06:30.
-- A gravação passou a carimbar -03:00 (lib/sgp/datas.ts); aqui corrigimos o
-- que já estava gravado, somando as 3 horas que faltavam.
update os_instalacao
set agendamento = agendamento + interval '3 hours'
where agendamento is not null;

update os_instalacao
set os_cadastrada_em = os_cadastrada_em + interval '3 hours'
where os_cadastrada_em is not null;
