#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gera supabase/seed.sql — massa de teste fictícia da Interlig (CLAUDE.md).

Determinístico: mesma SEED => mesmo arquivo. Rode com `npm run seed:gerar`.
Os usuários de login NÃO nascem aqui (auth.users é do Supabase Auth):
quem cria é scripts/criar-usuarios.mjs, que depois amarra usuario <-> vendedora.
"""
import random
import uuid
from datetime import date, datetime, time, timedelta
from pathlib import Path

SEED = 20260820
rng = random.Random(SEED)

RAIZ = Path(__file__).resolve().parent.parent
SAIDA = RAIZ / "supabase" / "seed.sql"

HOJE = date.today()
AGORA = datetime.combine(HOJE, time(18, 30))
INICIO_MES = HOJE.replace(day=1)


def uid() -> str:
    return str(uuid.UUID(int=rng.getrandbits(128), version=4))


def q(valor) -> str:
    """Literal SQL."""
    if valor is None:
        return "null"
    if isinstance(valor, bool):
        return "true" if valor else "false"
    if isinstance(valor, (int, float)):
        return str(valor)
    if isinstance(valor, date):
        return f"'{valor.isoformat()}'"
    return "'" + str(valor).replace("'", "''") + "'"


def linhas(registros):
    return ",\n".join("  (" + ", ".join(q(c) for c in reg) + ")" for reg in registros)


def add_meses(d: date, n: int) -> date:
    mes = d.month - 1 + n
    ano = d.year + mes // 12
    mes = mes % 12 + 1
    dia = min(d.day, [31, 29 if ano % 4 == 0 and (ano % 100 != 0 or ano % 400 == 0) else 28,
                      31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mes - 1])
    return date(ano, mes, dia)


# ---------------------------------------------------------------------------
# Calendário comercial: seg–sáb, menos feriados (convenção da seção 5 do PRD)
# ---------------------------------------------------------------------------
def pascoa(ano: int) -> date:
    a = ano % 19
    b, c = divmod(ano, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    mes = (h + l - 7 * m + 114) // 31
    dia = ((h + l - 7 * m + 114) % 31) + 1
    return date(ano, mes, dia)


def feriados(ano: int) -> dict:
    p = pascoa(ano)
    fer = {
        date(ano, 1, 1): "Confraternização Universal",
        date(ano, 4, 21): "Tiradentes",
        date(ano, 5, 1): "Dia do Trabalho",
        date(ano, 9, 7): "Independência",
        date(ano, 10, 12): "Nossa Senhora Aparecida",
        date(ano, 11, 2): "Finados",
        date(ano, 11, 15): "Proclamação da República",
        date(ano, 12, 25): "Natal",
        p - timedelta(days=48): "Carnaval (segunda)",
        p - timedelta(days=47): "Carnaval (terça)",
        p - timedelta(days=2): "Sexta-feira Santa",
        p + timedelta(days=60): "Corpus Christi",
    }
    return fer


# ---------------------------------------------------------------------------
# Cadastros
# ---------------------------------------------------------------------------
POPS = [
    {"id": uid(), "nome": "POP Santarém", "cidade": "Santarém", "lat": -2.4431, "lng": -54.7083},
    {"id": uid(), "nome": "POP Itaituba", "cidade": "Itaituba", "lat": -4.2761, "lng": -55.9836},
    {"id": uid(), "nome": "POP Oriximiná", "cidade": "Oriximiná", "lat": -1.7656, "lng": -55.8661},
]

# Bairros reais das cidades de atuação. Os centroides são aproximados de
# propósito: na Fase 1 o worker substitui por geocodificação em lote (PRD 3.6).
BAIRROS = {
    "Santarém": ["Aldeia", "Aparecida", "Caranazal", "Centro", "Diamantino", "Fátima",
                 "Interventoria", "Jutaí", "Laguinho", "Liberdade", "Livramento", "Maicá",
                 "Mapiri", "Matinha", "Nova República", "Prainha", "Salé", "Santana",
                 "Santo André", "São Cristóvão", "Uruará", "Mararu", "Nova Canaã", "Amparo"],
    "Itaituba": ["Centro", "Bela Vista", "Boa Esperança", "Bom Jardim", "Campo Verde",
                 "Cidade Nova", "Floresta", "Independência", "Liberdade", "Maria Magdalena",
                 "Novo Horizonte", "Santa Rita", "São José", "Vila Nova"],
    "Oriximiná": ["Centro", "Santa Terezinha", "Cidade Nova", "Bela Vista", "São José",
                  "Nova Esperança", "Vila Nova", "Boa Vista"],
}

PLANOS = [
    {"id": uid(), "sgp": "PL-200", "nome": "Fibra 200 Mega", "vel": "200 Mbps", "valor": 79.90, "peso": 26},
    {"id": uid(), "sgp": "PL-300", "nome": "Fibra 300 Mega", "vel": "300 Mbps", "valor": 89.90, "peso": 24},
    {"id": uid(), "sgp": "PL-400", "nome": "Fibra 400 Mega", "vel": "400 Mbps", "valor": 99.90, "peso": 18},
    {"id": uid(), "sgp": "PL-500", "nome": "Fibra 500 Mega", "vel": "500 Mbps", "valor": 109.90, "peso": 15},
    {"id": uid(), "sgp": "PL-700", "nome": "Fibra 700 Mega", "vel": "700 Mbps", "valor": 129.90, "peso": 10},
    {"id": uid(), "sgp": "PL-1000", "nome": "Fibra 1 Giga", "vel": "1 Gbps", "valor": 149.90, "peso": 7},
]

VENDEDORAS = [
    {"id": uid(), "nome": "Ana Paula Ferreira",    "sgp": "SGP-V001", "pop": 0, "forca": 1.25},
    {"id": uid(), "nome": "Bruna Castro Lima",     "sgp": "SGP-V002", "pop": 0, "forca": 1.05},
    {"id": uid(), "nome": "Carla Mendes Souza",    "sgp": "SGP-V003", "pop": 0, "forca": 0.85},
    {"id": uid(), "nome": "Daniela Rocha Alves",   "sgp": "SGP-V004", "pop": 0, "forca": 1.00},
    {"id": uid(), "nome": "Elaine Cristina Barros","sgp": "SGP-V005", "pop": 1, "forca": 1.15},
    {"id": uid(), "nome": "Fernanda Tavares",      "sgp": "SGP-V006", "pop": 1, "forca": 0.90},
    {"id": uid(), "nome": "Gabriela Nunes Pinto",  "sgp": "SGP-V007", "pop": 1, "forca": 0.75},
    {"id": uid(), "nome": "Helena Martins Costa",  "sgp": "SGP-V008", "pop": 2, "forca": 0.95},
]

ORIGENS = [("venda_externa", 0.45), ("trafego_pago", 0.25), ("presencial", 0.20), ("indicacao", 0.10)]

MOTIVOS = [
    ("Preço", 1), ("Concorrente", 2), ("Inviabilidade técnica", 3), ("Desistência", 4),
    ("Crédito reprovado", 5), ("Sem resposta", 6), ("Outro", 7),
]

NOMES = ["Adriano", "Beatriz", "Caio", "Dandara", "Edson", "Fabiana", "Gilberto", "Heloísa",
         "Ivan", "Joana", "Kléber", "Larissa", "Marcos", "Nádia", "Otávio", "Priscila",
         "Rafael", "Sandra", "Tiago", "Vanessa", "Wagner", "Yara", "Zeca", "Amanda",
         "Bruno", "Cristiane", "Diego", "Eliane", "Felipe", "Graça", "Hugo", "Isabel"]
SOBRENOMES = ["Alves", "Barbosa", "Cardoso", "Dias", "Esteves", "Farias", "Gomes", "Henriques",
              "Ibiapina", "Jardim", "Klein", "Lopes", "Moraes", "Nascimento", "Oliveira",
              "Pereira", "Queiroz", "Ramos", "Santos", "Teixeira", "Uchôa", "Vieira", "Xavier"]


def sorteia_origem():
    r = rng.random()
    acc = 0.0
    for nome, peso in ORIGENS:
        acc += peso
        if r <= acc:
            return nome
    return "outro"


def sorteia_plano():
    total = sum(p["peso"] for p in PLANOS)
    r = rng.randint(1, total)
    acc = 0
    for p in PLANOS:
        acc += p["peso"]
        if r <= acc:
            return p
    return PLANOS[0]


def nome_pessoa():
    return f"{rng.choice(NOMES)} {rng.choice(SOBRENOMES)}"


def cpf_ficticio():
    return "{:03d}.{:03d}.{:03d}-{:02d}".format(
        rng.randint(0, 999), rng.randint(0, 999), rng.randint(0, 999), rng.randint(0, 99))


def telefone_ficticio():
    return "(93) 9{}-{}".format(rng.randint(1000, 9999), rng.randint(1000, 9999))


# Sazonalidade: dezembro/janeiro fracos, meio do ano forte (volta às aulas e safra).
SAZONALIDADE = {1: 0.80, 2: 0.95, 3: 1.10, 4: 1.05, 5: 1.15, 6: 1.20,
                7: 1.10, 8: 1.05, 9: 1.00, 10: 1.05, 11: 1.10, 12: 0.75}


# ---------------------------------------------------------------------------
# Geração dos contratos
# ---------------------------------------------------------------------------
clientes, contratos, titulos = [], [], []
contratos_por_vendedora = {v["id"]: [] for v in VENDEDORAS}

ALVO_HISTORICO = 600
ALVO_MES_ATUAL = 80

# 12 meses fechados anteriores + mês corrente
meses = [add_meses(INICIO_MES, -i) for i in range(12, 0, -1)]
peso_total = sum(SAZONALIDADE[m.month] for m in meses)


def novo_contrato(data_venda: date, forcar_status=None):
    vend = rng.choices(VENDEDORAS, weights=[v["forca"] for v in VENDEDORAS])[0]
    pop = POPS[vend["pop"]]
    plano = sorteia_plano()
    origem = sorteia_origem()
    bairro = rng.choice(BAIRROS[pop["cidade"]])

    cliente_id = uid()
    clientes.append((cliente_id, f"SGP-C{len(clientes) + 1000}", nome_pessoa(), cpf_ficticio(),
                     telefone_ficticio(), bairro, pop["cidade"],
                     round(pop["lat"] + rng.uniform(-0.05, 0.05), 6),
                     round(pop["lng"] + rng.uniform(-0.05, 0.05), 6), origem))

    contrato_id = uid()
    data_assinatura = data_ativacao = data_cancelamento = None
    motivo_cancelamento = None
    status = "pendente_assinatura"

    if forcar_status == "pendente_assinatura":
        pass
    elif forcar_status == "aguardando_ativacao":
        data_assinatura = data_venda + timedelta(days=rng.randint(0, 3))
        status = "aguardando_ativacao"
    else:
        data_assinatura = data_venda + timedelta(days=rng.randint(0, 4))
        # ~4% travam na assinatura, ~6% travam aguardando instalação
        sorte = rng.random()
        if sorte < 0.04:
            data_assinatura = None
            status = "pendente_assinatura"
        elif sorte < 0.10:
            status = "aguardando_ativacao"
        else:
            data_ativacao = data_assinatura + timedelta(days=rng.randint(1, 22))
            if data_ativacao > HOJE:
                data_ativacao = None
                status = "aguardando_ativacao"
            else:
                status = "ativo"

    # ~8% de cancelamentos, com parte relevante em menos de 90 dias (churn precoce)
    if rng.random() < 0.08:
        if data_ativacao is not None:
            dias = rng.choice([rng.randint(10, 89), rng.randint(10, 89), rng.randint(95, 330)])
            cancel = data_ativacao + timedelta(days=dias)
            if cancel <= HOJE:
                data_cancelamento = cancel
                status = "cancelado"
                motivo_cancelamento = rng.choice(
                    ["Inadimplência", "Mudança de endereço", "Insatisfação técnica",
                     "Migrou para concorrente", "Financeiro do cliente"])
        elif rng.random() < 0.5:
            data_cancelamento = data_venda + timedelta(days=rng.randint(1, 12))
            if data_cancelamento <= HOJE:
                status = "cancelado"
                # 5.1: estes NÃO contam como venda do período
                motivo_cancelamento = rng.choice(["Erro de cadastro", "Duplicidade"])
            else:
                data_cancelamento = None

    contratos.append({
        "id": contrato_id, "sgp": f"SGP-CT{len(contratos) + 5000}", "cliente_id": cliente_id,
        "vendedor_id": vend["id"], "plano_id": plano["id"], "pop_id": pop["id"],
        "valor": plano["valor"], "instalacao": rng.choice([0, 0, 0, 99.90, 149.90]),
        "status": status, "origem": origem, "data_venda": data_venda,
        "data_assinatura": data_assinatura, "data_ativacao": data_ativacao,
        "data_cancelamento": data_cancelamento, "motivo_cancelamento": motivo_cancelamento,
    })
    contratos_por_vendedora[vend["id"]].append(contrato_id)
    return contratos[-1]


for mes in meses:
    prox = add_meses(mes, 1)
    dias_no_mes = (prox - mes).days
    qtd = int(round(ALVO_HISTORICO * SAZONALIDADE[mes.month] / peso_total))
    for _ in range(qtd):
        dia = rng.randint(1, dias_no_mes)
        data_venda = mes + timedelta(days=dia - 1)
        if data_venda.weekday() == 6:  # domingo: raro
            data_venda -= timedelta(days=1)
        novo_contrato(data_venda)

# Mês atual: mistura proposital de status para a esteira (PRD 3.5) ter o que mostrar
dias_corridos = (HOJE - INICIO_MES).days + 1
for i in range(ALVO_MES_ATUAL):
    data_venda = INICIO_MES + timedelta(days=rng.randint(0, max(0, dias_corridos - 1)))
    if data_venda.weekday() == 6:
        data_venda -= timedelta(days=1)
    r = rng.random()
    forcado = "pendente_assinatura" if r < 0.25 else ("aguardando_ativacao" if r < 0.60 else None)
    novo_contrato(data_venda, forcar_status=forcado)

# Vendas "não atribuídas" (PRD seção 2: vendedor do SGP sem mapeamento)
for c in rng.sample(contratos, 6):
    c["vendedor_id"] = None

# ---------------------------------------------------------------------------
# Títulos financeiros (~7% de inadimplência na 1ª fatura — regra 5.11)
# ---------------------------------------------------------------------------
for c in contratos:
    if c["data_ativacao"] is None:
        continue
    primeiro_venc = add_meses(c["data_ativacao"], 1)
    inadimplente_1a = rng.random() < 0.07
    for parcela in range(1, 7):
        venc = add_meses(primeiro_venc, parcela - 1)
        if venc > HOJE + timedelta(days=35):
            break
        if c["data_cancelamento"] and venc > c["data_cancelamento"]:
            break
        status, pagamento = "aberto", None
        if venc <= HOJE:
            if parcela == 1 and inadimplente_1a:
                status = "aberto"  # vencido e não liquidado
            elif rng.random() < 0.05:
                status = "aberto"
            else:
                status = "liquidado"
                pagamento = venc + timedelta(days=rng.randint(-4, 6))
                if pagamento > HOJE:
                    pagamento = HOJE
        titulos.append((uid(), f"SGP-T{len(titulos) + 90000}", c["id"], parcela,
                        c["valor"], venc, pagamento, status))

# ---------------------------------------------------------------------------
# CRM: ~150 tickets em todas as etapas e desfechos (PRD 3.9)
# ---------------------------------------------------------------------------
motivos_ids = {nome: uid() for nome, _ in MOTIVOS}
tickets = []
ETAPAS_ABERTAS = ["novo", "em_atendimento", "proposta", "aguardando"]
contratos_recentes = [c for c in contratos if c["data_venda"] >= add_meses(HOJE, -2)]
usados_para_reconciliar = set()

for i in range(150):
    criado = AGORA - timedelta(days=rng.randint(0, 75), hours=rng.randint(0, 23))
    vend = rng.choices(VENDEDORAS, weights=[v["forca"] for v in VENDEDORAS])[0]
    pop = POPS[vend["pop"]]
    vendedor_id = vend["id"]
    if rng.random() < 0.05:
        vendedor_id = None  # não atribuído: supervisor distribui (PRD 3.9)

    r = rng.random()
    if r < 0.30:  # ainda em andamento
        etapa = rng.choice(ETAPAS_ABERTAS)
        tickets.append({
            "id": uid(), "origem_criacao": "sz_auto" if rng.random() < 0.7 else "manual",
            "sz_conversa_id": f"SZ-{rng.randint(100000, 999999)}-{i}" if rng.random() < 0.7 else None,
            "cliente_nome": nome_pessoa(), "telefone": telefone_ficticio(),
            "cpf": cpf_ficticio() if rng.random() < 0.4 else None,
            "vendedor_id": vendedor_id, "pop_id": pop["id"], "etapa": etapa,
            "criado_em": criado,
            "primeira_tratativa_em": (criado + timedelta(minutes=rng.randint(2, 400))
                                      if etapa != "novo" else None),
            "followup_em": (criado + timedelta(days=rng.randint(1, 6))
                            if etapa in ("proposta", "aguardando") else None),
            "fechado_em": None, "desfecho": None, "fechado_por": None, "motivo_id": None,
            "plano_id": None, "origem_cadastro": None, "contrato_id": None, "reconciliado_em": None,
        })
        continue

    # fechados
    fechado = criado + timedelta(days=rng.randint(1, 18))
    if fechado > AGORA:
        fechado = AGORA
    convertido = rng.random() < 0.42
    plano = sorteia_plano()
    contrato_id = None
    reconciliado = None
    if convertido:
        # ~88% reconciliam com um contrato do SGP; o resto vira alerta no painel
        # do gestor (PRD 3.9: convertido sem contrato em 7 dias)
        disponiveis = [c for c in contratos_recentes
                       if c["id"] not in usados_para_reconciliar and c["vendedor_id"] == vendedor_id]
        if disponiveis and rng.random() < 0.88:
            escolhido = rng.choice(disponiveis)
            usados_para_reconciliar.add(escolhido["id"])
            contrato_id = escolhido["id"]
            reconciliado = fechado + timedelta(days=rng.randint(0, 5))
            if reconciliado > AGORA:
                reconciliado = AGORA
    else:
        auto = rng.random() < 0.22

    tickets.append({
        "id": uid(), "origem_criacao": "sz_auto" if rng.random() < 0.7 else "manual",
        "sz_conversa_id": f"SZ-{rng.randint(100000, 999999)}-{i}" if rng.random() < 0.7 else None,
        "cliente_nome": nome_pessoa(), "telefone": telefone_ficticio(),
        "cpf": cpf_ficticio() if convertido or rng.random() < 0.4 else None,
        "vendedor_id": vendedor_id, "pop_id": pop["id"], "etapa": "fechado",
        "criado_em": criado,
        "primeira_tratativa_em": criado + timedelta(minutes=rng.randint(2, 600)),
        "followup_em": None, "fechado_em": fechado,
        "desfecho": "convertido" if convertido else "nao_convertido",
        "fechado_por": "vendedora" if convertido or not auto else "auto_inatividade",
        "motivo_id": None if convertido else (
            motivos_ids["Sem resposta"] if auto else motivos_ids[rng.choice(
                ["Preço", "Concorrente", "Inviabilidade técnica", "Desistência",
                 "Crédito reprovado", "Outro"])]),
        "plano_id": plano["id"] if convertido else None,
        "origem_cadastro": sorteia_origem() if convertido else None,
        "contrato_id": contrato_id, "reconciliado_em": reconciliado,
    })

# ---------------------------------------------------------------------------
# Metas do mês vigente + regra de comissão de exemplo (3 degraus)
# ---------------------------------------------------------------------------
metas = []
for v in VENDEDORAS:
    metas.append(("vendedora", v["id"], INICIO_MES, int(round(22 * v["forca"])), None))
for p in POPS:
    alvo = sum(int(round(22 * v["forca"])) for v in VENDEDORAS if POPS[v["pop"]]["id"] == p["id"])
    metas.append(("pop", p["id"], INICIO_MES, alvo, None))
metas.append(("global", None, INICIO_MES, sum(int(round(22 * v["forca"])) for v in VENDEDORAS), None))

DEGRAUS = """[
    {"atingimento_min": 0,   "atingimento_max": 79,   "tipo": "valor_por_venda", "valor": 25.00, "bonus_fixo": 0},
    {"atingimento_min": 80,  "atingimento_max": 99,   "tipo": "valor_por_venda", "valor": 40.00, "bonus_fixo": 0},
    {"atingimento_min": 100, "atingimento_max": null, "tipo": "valor_por_venda", "valor": 55.00, "bonus_fixo": 300.00}
  ]"""
GATILHOS = """[
    {"condicao": "ticket_medio_min", "valor": 110.00, "adicional": 150.00},
    {"condicao": "plano_premium",    "plano": "Fibra 1 Giga", "adicional": 20.00}
  ]"""

# ---------------------------------------------------------------------------
# Montagem do SQL
# ---------------------------------------------------------------------------
out = []
w = out.append

w("-- =====================================================================")
w("-- seed.sql — massa de teste fictícia da Interlig")
w(f"-- GERADO AUTOMATICAMENTE por scripts/gerar_seed.py (seed={SEED}) — não editar à mão.")
w(f"-- Referência: {HOJE.isoformat()}  |  contratos: {len(contratos)}  |  tickets: {len(tickets)}")
w("-- Os usuários de login são criados por scripts/criar-usuarios.mjs.")
w("-- =====================================================================")
w("")
w("begin;")
w("")
w("-- Limpa a massa anterior (tickets têm trigger anti-exclusão: desligado só aqui).")
w("alter table tickets disable trigger tickets_sem_delete;")
w("alter table ticket_eventos disable trigger eventos_sem_delete;")
w("delete from ticket_eventos;")
w("delete from tickets;")
w("alter table tickets enable trigger tickets_sem_delete;")
w("alter table ticket_eventos enable trigger eventos_sem_delete;")
w("delete from comissoes_fechadas;")
w("delete from titulos;")
w("delete from contratos;")
w("delete from clientes;")
w("delete from metas;")
w("delete from regras_comissao;")
w("delete from sz_atendentes_map;")
w("delete from motivos_nao_conversao;")
w("delete from sync_runs;")
w("delete from bairros_geo;")
w("delete from origem_map;")
w("delete from calendario;")
w("delete from planos;")
w("update usuarios set vendedor_id = null;")
w("update pops set supervisor_id = null;")
w("delete from vendedores;")
w("delete from pops;")
w("")

w("-- ---------- POPs ----------")
w("insert into pops (id, nome, cidade) values")
w(linhas([(p["id"], p["nome"], p["cidade"]) for p in POPS]) + ";")
w("")

w("-- ---------- Vendedoras ----------")
w("insert into vendedores (id, nome, sgp_vendedor_id, pop_id, ativo) values")
w(linhas([(v["id"], v["nome"], v["sgp"], POPS[v["pop"]]["id"], True) for v in VENDEDORAS]) + ";")
w("")

w("-- ---------- Planos ----------")
w("insert into planos (id, sgp_plano_id, nome, velocidade, valor_referencia, ativo) values")
w(linhas([(p["id"], p["sgp"], p["nome"], p["vel"], p["valor"], True) for p in PLANOS]) + ";")
w("")

w("-- ---------- De/para de origem (PRD 3.10) ----------")
w("insert into origem_map (valor_sgp, categoria) values")
w(linhas([("VENDA EXTERNA", "venda_externa"), ("PAP", "venda_externa"),
          ("SITE", "trafego_pago"), ("FACEBOOK ADS", "trafego_pago"), ("GOOGLE ADS", "trafego_pago"),
          ("LOJA", "presencial"), ("BALCAO", "presencial"),
          ("INDICACAO", "indicacao"), ("AMIGO INDICA", "indicacao"),
          ("OUTROS", "outro")]) + ";")
w("")

w("-- ---------- Motivos de não conversão (PRD 3.9) ----------")
w("insert into motivos_nao_conversao (id, nome, ativo, ordem) values")
w(linhas([(motivos_ids[nome], nome, True, ordem) for nome, ordem in MOTIVOS]) + ";")
w("")

w("-- ---------- Bairros (centroides aproximados; geocoding real na Fase 1) ----------")
regs = []
for p in POPS:
    for b in BAIRROS[p["cidade"]]:
        regs.append((p["cidade"], b,
                     round(p["lat"] + rng.uniform(-0.04, 0.04), 6),
                     round(p["lng"] + rng.uniform(-0.04, 0.04), 6)))
w("insert into bairros_geo (cidade, bairro, lat_centroide, lng_centroide) values")
w(linhas(regs) + ";")
w("")

w("-- ---------- Calendário comercial (seg–sáb menos feriados) ----------")
regs = []
d = date(HOJE.year - 1, 1, 1)
fim = date(HOJE.year + 1, 12, 31)
mapa_feriados = {}
for ano in range(HOJE.year - 1, HOJE.year + 2):
    mapa_feriados.update(feriados(ano))
while d <= fim:
    fer = mapa_feriados.get(d)
    regs.append((d, d.weekday() <= 5 and fer is None, fer))
    d += timedelta(days=1)
w("insert into calendario (data, dia_util, feriado) values")
w(linhas(regs) + ";")
w("")

w("-- ---------- Clientes ----------")
for i in range(0, len(clientes), 200):
    w("insert into clientes (id, sgp_cliente_id, nome, cpf, telefone, bairro, cidade, lat, lng, origem_cadastro) values")
    w(linhas(clientes[i:i + 200]) + ";")
w("")

w("-- ---------- Contratos ----------")
cols = ("id, sgp_contrato_id, cliente_id, vendedor_id, plano_id, pop_id, valor_mensalidade, "
        "valor_instalacao, status, origem_cadastro, data_venda, data_assinatura, data_ativacao, "
        "data_cancelamento, motivo_cancelamento")
regs = [(c["id"], c["sgp"], c["cliente_id"], c["vendedor_id"], c["plano_id"], c["pop_id"],
         c["valor"], c["instalacao"], c["status"], c["origem"], c["data_venda"],
         c["data_assinatura"], c["data_ativacao"], c["data_cancelamento"], c["motivo_cancelamento"])
        for c in contratos]
for i in range(0, len(regs), 200):
    w(f"insert into contratos ({cols}) values")
    w(linhas(regs[i:i + 200]) + ";")
w("")

w("-- ---------- Títulos ----------")
for i in range(0, len(titulos), 300):
    w("insert into titulos (id, sgp_titulo_id, contrato_id, numero_parcela, valor, vencimento, data_pagamento, status) values")
    w(linhas(titulos[i:i + 300]) + ";")
w("")

w("-- ---------- Metas do mês vigente ----------")
w("insert into metas (escopo, referencia_id, mes_ano, quantidade_vendas, receita) values")
w(linhas(metas) + ";")
w("")

w("-- ---------- Regra de comissão vigente (3 degraus, PRD seção 6) ----------")
w("insert into regras_comissao (escopo, referencia_id, vigencia_inicio, vigencia_fim, degraus, gatilhos, estorno_dias) values")
w(f"  ('global', null, {q(INICIO_MES.replace(month=1, day=1))}, null, '{DEGRAUS}'::jsonb, '{GATILHOS}'::jsonb, 90);")
w("")

w("-- ---------- CRM: tickets ----------")
cols_t = ("id, origem_criacao, sz_conversa_id, cliente_nome, telefone, cpf, vendedor_id, pop_id, "
          "etapa, criado_em, primeira_tratativa_em, followup_em, fechado_em, desfecho, fechado_por, "
          "motivo_id, plano_id, origem_cadastro, contrato_id, reconciliado_em")
regs = [(t["id"], t["origem_criacao"], t["sz_conversa_id"], t["cliente_nome"], t["telefone"],
         t["cpf"], t["vendedor_id"], t["pop_id"], t["etapa"],
         t["criado_em"].isoformat(sep=" "),
         t["primeira_tratativa_em"].isoformat(sep=" ") if t["primeira_tratativa_em"] else None,
         t["followup_em"].isoformat(sep=" ") if t["followup_em"] else None,
         t["fechado_em"].isoformat(sep=" ") if t["fechado_em"] else None,
         t["desfecho"], t["fechado_por"], t["motivo_id"], t["plano_id"], t["origem_cadastro"],
         t["contrato_id"], t["reconciliado_em"].isoformat(sep=" ") if t["reconciliado_em"] else None)
        for t in tickets]
w("-- O trigger tickets_registra_evento cria a trilha em ticket_eventos sozinho.")
for i in range(0, len(regs), 100):
    w(f"insert into tickets ({cols_t}) values")
    w(linhas(regs[i:i + 100]) + ";")
w("")

w("-- ---------- Mapeamento de atendentes do SZ Chat ----------")
w("insert into sz_atendentes_map (sz_atendente_id, sz_atendente_nome, vendedor_id) values")
w(linhas([(f"SZ-AT-{i + 1:03d}", v["nome"], v["id"]) for i, v in enumerate(VENDEDORAS[:6])]) + ";")
w("")

w("-- ---------- Histórico de sincronização (alimenta o selo 'atualizado há X min') ----------")
regs = []
for entidade in ["clientes", "contratos", "titulos", "planos"]:
    for k in range(3):
        ini = f"now() - interval '{8 * (k + 1)} minutes'"
        regs.append((entidade, ini, k))
w("insert into sync_runs (entidade, iniciado_em, finalizado_em, registros, status) values")
w(",\n".join(
    f"  ({q(e)}, {ini}, {ini} + interval '40 seconds', {rng.randint(5, 220)}, 'sucesso')"
    for e, ini, _ in regs) + ";")
w("")

w("commit;")
w("")

SAIDA.write_text("\n".join(out), encoding="utf-8")

ativos = sum(1 for c in contratos if c["status"] == "ativo")
cancelados = sum(1 for c in contratos if c["status"] == "cancelado")
churn_precoce = sum(1 for c in contratos if c["data_cancelamento"] and c["data_ativacao"]
                    and (c["data_cancelamento"] - c["data_ativacao"]).days <= 90)
convertidos = sum(1 for t in tickets if t["desfecho"] == "convertido")
fechados = sum(1 for t in tickets if t["etapa"] == "fechado")

print(f"seed.sql gerado em {SAIDA}")
print(f"  contratos ............. {len(contratos)} (ativos {ativos}, cancelados {cancelados}, "
      f"churn precoce {churn_precoce})")
print(f"  do mês corrente ....... {sum(1 for c in contratos if c['data_venda'] >= INICIO_MES)}")
print(f"  clientes .............. {len(clientes)}")
print(f"  títulos ............... {len(titulos)}")
print(f"  tickets ............... {len(tickets)} (fechados {fechados}, convertidos {convertidos})")
print(f"  conversão real (5.14) . {convertidos / fechados:.1%}")
