from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import os
import re
import shutil
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from validar_release_candidata_wash import validate_release


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT.parent / "02_intermediate"
DEFAULT_OUTPUT_ROOT = ROOT / "data" / "staging"
MATRIX_PATH = ROOT / "docs" / "matriz_questoes_estrategicas_wash_20260907.csv"
CURRENT_JSON = ROOT / "data" / "current.json"
ACTIVE_RELEASES_DIR = ROOT / "data" / "releases"
W1_DOC = ROOT / "docs" / "w1_dados_comuns_release_candidata_wash_20260907.md"

EXPECTED_QUESTIONS = [
    "19", "22", "23", "28", "40", "43", "50", "58", "65", "68", "69",
    "76", "81", "83", "84", "85", "94", "98", "99", "101", "103", "104",
    "105", "106", "109", "111", "115", "116", "117", "118", "119",
]

META_TARGET = 0.90
SMALL_N_THRESHOLD = None
SMALL_N_STATUS = "PENDING_PRIVACY_POLICY"
SEMANTIC_CONTRACT_VERSION = "wash_31q_20260907"
PRIVACY_CONTRACT_VERSION = "wash_privacy_w1_20260907"

PERSONAL_FIELDS_EXCLUDED = [
    "registro_hash",
    "escola_hash",
    "nome_gestor",
    "telefone_gestor",
    "email_escola",
    "nome_responsavel_preenchimento",
    "funcao",
    "whatsapp",
    "email_responsavel_preenchimento",
    "endereço/endereco",
    "texto_livre",
    "campo_sensivel",
    "uso_dashboard_interno",
]


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def normalize_bool(value: str) -> bool:
    return str(value or "").strip().lower() in {"true", "1", "sim", "s", "yes"}


def normalize_text(value: str) -> str:
    return " ".join(str(value or "").strip().split())


def normalize_for_match(value: str) -> str:
    text = normalize_text(value).casefold()
    replacements = {
        "ã": "a", "á": "a", "à": "a", "â": "a",
        "é": "e", "ê": "e",
        "í": "i",
        "ó": "o", "ô": "o", "õ": "o",
        "ú": "u",
        "ç": "c",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    return text


def int_value(value: Any) -> int:
    if value in (None, ""):
        return 0
    return int(float(str(value).replace(",", ".")))


def float_value(value: Any) -> float:
    if value in (None, ""):
        return 0.0
    return float(str(value).replace(",", "."))


def pct(part: int, total: int, digits: int = 2) -> float:
    return round((part / total) * 100, digits) if total else 0.0


def safe_rmtree(path: Path, allowed_root: Path) -> None:
    resolved = path.resolve()
    root = allowed_root.resolve()
    if not str(resolved).startswith(str(root)):
        raise RuntimeError(f"Recusa de remover caminho fora do output-root: {resolved}")
    if path.name in {"", ".", ".."} or not path.name.startswith(".__tmp_wash_"):
        raise RuntimeError(f"Recusa de remover diretório temporário inesperado: {resolved}")
    if resolved.exists():
        shutil.rmtree(resolved)


def write_json(path: Path, payload: Any, pretty: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if pretty:
        text = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=False)
    else:
        text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=False)
    path.write_text(text + "\n", encoding="utf-8")


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def file_line_count(path: Path) -> int:
    with path.open("rb") as f:
        count = sum(chunk.count(b"\n") for chunk in iter(lambda: f.read(1024 * 1024), b""))
    return max(count - 1, 0)


def file_stats(path: Path, logical_role: str) -> dict[str, Any]:
    return {
        "logical_role": logical_role,
        "path": str(path),
        "format": path.suffix.lstrip(".").lower(),
        "bytes": path.stat().st_size,
        "sha256": sha256_file(path),
        "rows_estimated": file_line_count(path) if path.suffix.lower() == ".csv" else None,
        "modified_at": datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).astimezone().isoformat(timespec="seconds"),
    }


def find_source_date(source_dir: Path) -> str:
    candidates = []
    for path in source_dir.glob("fato_autoavaliacao_itens_escola_*.csv"):
        match = re.search(r"(\d{4}-\d{2}-\d{2})", path.name)
        if match:
            candidates.append(match.group(1))
    if not candidates:
        raise FileNotFoundError(f"Nenhum fato P45 localizado em {source_dir}")
    return sorted(candidates)[-1]


def resolve_sources(source: Path) -> tuple[str, dict[str, Path]]:
    if source.is_file():
        source_dir = source.parent
        match = re.search(r"(\d{4}-\d{2}-\d{2})", source.name)
        if not match:
            raise ValueError("--source como arquivo precisa conter YYYY-MM-DD no nome.")
        source_date = match.group(1)
    else:
        source_dir = source
        source_date = find_source_date(source_dir)

    paths = {
        "dim_questions": source_dir / f"dim_perguntas_pesquisa_45_{source_date}.csv",
        "fact_items_long": source_dir / f"fato_autoavaliacao_itens_escola_{source_date}.csv",
        "coverage_municipal": source_dir / f"pesquisa_45_cobertura_municipal_{source_date}.csv",
        "status_dimension": source_dir / f"dim_status_resposta_pesquisa_45_{source_date}.csv",
        "valid_response_wide": source_dir / f"pesquisa_45_resposta_valida_por_escola_{source_date}.csv",
        "census_school_dimension": source_dir / "dim_escolas_municipais_ativas_censo_2025.csv",
        "strategic_matrix": MATRIX_PATH,
    }
    missing = [str(path) for path in paths.values() if not path.exists()]
    if missing:
        raise FileNotFoundError(f"Fontes obrigatórias ausentes: {missing}")
    return source_date, paths


def combined_source_hash(source_stats: dict[str, dict[str, Any]], censo_reference_year: int) -> str:
    h = hashlib.sha256()
    h.update(f"censo_reference_year={censo_reference_year}\n".encode("utf-8"))
    for key in sorted(source_stats):
        item = source_stats[key]
        h.update(f"{key}|{Path(item['path']).name}|{item['bytes']}|{item['sha256']}\n".encode("utf-8"))
    return h.hexdigest()


def read_matrix() -> list[dict[str, str]]:
    with MATRIX_PATH.open("r", encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f, delimiter=";"))
    numbers = [row["question_number"] for row in rows]
    if numbers != EXPECTED_QUESTIONS:
        raise ValueError(f"Matriz estratégica não bate com a lista definitiva: {numbers}")
    if "semantic_interpretation" not in rows[0]:
        raise ValueError("Matriz estratégica sem coluna semantic_interpretation.")
    return rows


def read_dim_flags(path: Path) -> dict[str, dict[str, str]]:
    flags: dict[str, dict[str, str]] = {}
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            flags[row["codigo_pergunta"]] = row
    return flags


def question_catalog(matrix_rows: list[dict[str, str]], dim_flags: dict[str, dict[str, str]]) -> list[dict[str, Any]]:
    questions: list[dict[str, Any]] = []
    for idx, row in enumerate(matrix_rows, start=1):
        q = row["question_number"]
        field = row["p45_field"]
        dim = dim_flags.get(field, {})
        public_note = row.get("public_granularity_note", "")
        sensitive = dim.get("campo_sensivel") == "Sim" or "supress" in normalize_for_match(public_note)
        requires_suppression = "supress" in normalize_for_match(public_note)
        if sensitive or requires_suppression:
            privacy_status = "REQUIRES_REVIEW"
            public_school_level_allowed = False
        else:
            privacy_status = "PUBLIC_AGGREGATE_AND_SCHOOL"
            public_school_level_allowed = True

        try:
            observed = json.loads(row.get("observed_options_json", "[]") or "[]")
        except json.JSONDecodeError:
            observed = []

        questions.append(
            {
                "question_number": q,
                "block": row["block"],
                "question_text_full": row["question_text"],
                "question_text_short": row.get("display_label") or re.sub(r"^\d+\s*-\s*", "", row["question_text"]),
                "p45_field": field,
                "response_type": row["response_type"],
                "semantic_interpretation": row["semantic_interpretation"],
                "observed_options": observed,
                "display_order": idx,
                "display_label": row.get("display_label", ""),
                "recommended_visual": row.get("recommended_visual", ""),
                "denominator_rule": row.get("denominator_rule", ""),
                "missing_rule": row.get("missing_rule", ""),
                "caution_text": row.get("requires_caution_text", ""),
                "multi_response": row["semantic_interpretation"] == "MULTI_RESPONSE",
                "percentages_may_exceed_100": row["semantic_interpretation"] == "MULTI_RESPONSE",
                "public_school_level_allowed": public_school_level_allowed,
                "aggregate_allowed": True,
                "requires_suppression": requires_suppression,
                "privacy_status": privacy_status,
                "source_publication_granularity": public_note,
                "source_sensitive_flag": dim.get("campo_sensivel", ""),
                "source_text_free_flag": dim.get("texto_livre", ""),
                "source_dashboard_public_flag": dim.get("permitido_dashboard_publico", ""),
            }
        )
    return questions


def read_coverage(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            eligible = int_value(row["total_escolas_elegiveis"])
            completed = int_value(row["escolas_finalizadas_atualmente"])
            pending = int_value(row["escolas_sem_resposta_atualmente"])
            needed = max(math.ceil(META_TARGET * eligible) - completed, 0)
            coverage = pct(completed, eligible)
            rows.append(
                {
                    "ibge": str(row["codigo_ibge"]),
                    "municipality": row["municipio"],
                    "uf": row["uf"],
                    "eligible_schools": eligible,
                    "completed_schools": completed,
                    "pending_schools": pending,
                    "coverage_pct": coverage,
                    "needed_for_90_municipal": needed,
                    "target_status": "100_PERCENT" if eligible and completed >= eligible else ("AT_LEAST_90" if eligible and completed / eligible >= META_TARGET else ("BELOW_50" if eligible and completed / eligible < 0.5 else "BELOW_90")),
                    "data_last_response_current": row.get("data_ultima_resposta_atual", ""),
                }
            )
    return sorted(rows, key=lambda r: (r["uf"], r["municipality"], r["ibge"]))


def summarize_monitoring(coverage_rows: list[dict[str, Any]]) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
    totals = {
        "municipalities": len(coverage_rows),
        "ufs": len({r["uf"] for r in coverage_rows}),
        "eligible_schools": sum(r["eligible_schools"] for r in coverage_rows),
        "completed_schools": sum(r["completed_schools"] for r in coverage_rows),
        "pending_schools": sum(r["pending_schools"] for r in coverage_rows),
        "municipalities_100": sum(1 for r in coverage_rows if r["eligible_schools"] and r["completed_schools"] >= r["eligible_schools"]),
        "municipalities_at_least_90": sum(1 for r in coverage_rows if r["eligible_schools"] and r["completed_schools"] / r["eligible_schools"] >= META_TARGET),
        "municipalities_below_50": sum(1 for r in coverage_rows if r["eligible_schools"] and r["completed_schools"] / r["eligible_schools"] < 0.5),
        "schools_needed_for_90_national": 0,
        "schools_needed_for_90_sum_municipal": sum(r["needed_for_90_municipal"] for r in coverage_rows),
        "target_pct": 90,
    }
    totals["coverage_pct"] = pct(totals["completed_schools"], totals["eligible_schools"])
    totals["schools_needed_for_90_national"] = max(math.ceil(META_TARGET * totals["eligible_schools"]) - totals["completed_schools"], 0)

    by_uf: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in coverage_rows:
        by_uf[row["uf"]].append(row)

    uf_rows = []
    for uf, items in sorted(by_uf.items()):
        eligible = sum(i["eligible_schools"] for i in items)
        completed = sum(i["completed_schools"] for i in items)
        pending = sum(i["pending_schools"] for i in items)
        uf_rows.append(
            {
                "uf": uf,
                "municipalities": len(items),
                "eligible_schools": eligible,
                "completed_schools": completed,
                "pending_schools": pending,
                "coverage_pct": pct(completed, eligible),
                "municipalities_100": sum(1 for i in items if i["eligible_schools"] and i["completed_schools"] >= i["eligible_schools"]),
                "municipalities_at_least_90": sum(1 for i in items if i["eligible_schools"] and i["completed_schools"] / i["eligible_schools"] >= META_TARGET),
                "municipalities_below_50": sum(1 for i in items if i["eligible_schools"] and i["completed_schools"] / i["eligible_schools"] < 0.5),
                "schools_needed_for_90_uf": max(math.ceil(META_TARGET * eligible) - completed, 0),
                "schools_needed_for_90_sum_municipal": sum(i["needed_for_90_municipal"] for i in items),
            }
        )

    return totals, uf_rows, coverage_rows


def read_census_schools(path: Path) -> dict[str, dict[str, Any]]:
    schools: dict[str, dict[str, Any]] = {}
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            if not (
                normalize_bool(row.get("situacao_ativa"))
                and normalize_bool(row.get("dependencia_municipal"))
                and normalize_bool(row.get("elegivel_opcao_4_2"))
                and normalize_bool(row.get("codigo_escola_valido"))
                and normalize_bool(row.get("codigo_ibge_valido"))
                and normalize_bool(row.get("pertence_universo_pcj"))
                and not normalize_bool(row.get("duplicado_codigo_censo"))
            ):
                continue
            code = str(row["codigo_escola"]).strip()
            schools[code] = {
                "inep": code,
                "school_name": row["nome_escola"],
                "ibge": str(row["codigo_ibge"]).strip(),
                "municipality": row["municipio"],
                "uf": row["uf"],
            }
    return schools


def parse_multi_response(value: str, field: str) -> list[str]:
    clean = normalize_text(value)
    if not clean:
        return []
    prefix = f"response_json_{field}"
    if clean.startswith(prefix):
        clean = clean[len(prefix):].strip()
    if clean.startswith("|"):
        clean = clean[1:].strip()
    parts = [normalize_text(part) for part in clean.split("|")]
    return [part for part in parts if part]


def is_dont_know(value: str) -> bool:
    return "nao sei" in normalize_for_match(value) or "nao sabe" in normalize_for_match(value)


def is_not_applicable(value: str) -> bool:
    return "nao se aplica" in normalize_for_match(value)


def read_completed_wide(path: Path, questions: list[dict[str, Any]]) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    selected_fields = [q["p45_field"] for q in questions]
    completed: dict[str, dict[str, Any]] = {}
    stats = {
        "rows": 0,
        "eligible_completed_rows": 0,
        "all_completed_rows": 0,
        "max_response_date": "",
        "response_question_columns_available": 0,
    }
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        stats["response_question_columns_available"] = len(
            [
                col for col in (reader.fieldnames or [])
                if col.startswith("resposta_")
                and col not in {"resposta_finalizada", "resposta_selecionada", "resposta_selecionada_ate_prazo"}
            ]
        )
        for row in reader:
            stats["rows"] += 1
            if row.get("completed") == "1" or row.get("resposta_finalizada") == "Sim":
                stats["all_completed_rows"] += 1
            if not (row.get("vinculada_censo_2025") == "Sim" and row.get("elegivel_opcao_4_2") == "Sim"):
                continue
            if not (row.get("completed") == "1" or row.get("resposta_finalizada") == "Sim"):
                continue
            code = str(row["codigo_escola_limpo"]).strip()
            answers = {q: normalize_text(row.get(f"resposta_{q}", "")) or None for q in selected_fields}
            completed[code] = {
                "inep": code,
                "school_name": row.get("nome_escola", ""),
                "ibge": str(row.get("codigo_ibge", "")).strip(),
                "municipality": row.get("municipio", ""),
                "uf": row.get("uf", ""),
                "response_date": row.get("response_date", ""),
                "update_date": row.get("update_date", ""),
                "localizacao": normalize_text(row.get("resposta_localizacao", "")) or None,
                "answers_by_field": answers,
            }
            if row.get("response_date", "") > stats["max_response_date"]:
                stats["max_response_date"] = row.get("response_date", "")
    stats["eligible_completed_rows"] = len(completed)
    return completed, stats


class QuestionStats:
    def __init__(self, question: dict[str, Any], n_scope: int, n_completed: int) -> None:
        self.question = question
        self.n_scope = n_scope
        self.n_completed = n_completed
        self.n_valid = 0
        self.n_missing = 0
        self.n_not_applicable = 0
        self.n_dont_know = 0
        self.option_counts: Counter[str] = Counter()

    def add_answer(self, value: str | None) -> None:
        if not value:
            self.n_missing += 1
            return
        if self.question["multi_response"]:
            options = parse_multi_response(value, self.question["p45_field"])
            if not options:
                self.n_missing += 1
                return
            self.n_valid += 1
            for option in options:
                self.option_counts[option] += 1
                if is_not_applicable(option):
                    self.n_not_applicable += 1
                if is_dont_know(option):
                    self.n_dont_know += 1
        else:
            option = normalize_text(value)
            if not option:
                self.n_missing += 1
                return
            self.n_valid += 1
            self.option_counts[option] += 1
            if is_not_applicable(option):
                self.n_not_applicable += 1
            if is_dont_know(option):
                self.n_dont_know += 1

    def finalize_missing(self) -> None:
        # Se algum completed não teve linha/valor observado, ele é missing da pergunta.
        observed = self.n_valid + self.n_missing
        if observed < self.n_completed:
            self.n_missing += self.n_completed - observed

    def as_dict(self) -> dict[str, Any]:
        self.finalize_missing()
        options = []
        for label, count in sorted(self.option_counts.items(), key=lambda item: (-item[1], item[0])):
            opt = {
                "label": label,
                "count": count,
                "pct_valid": pct(count, self.n_valid, 4),
            }
            if self.question["multi_response"]:
                opt["option_pct_respondents"] = pct(count, self.n_valid, 4)
            options.append(opt)

        payload = {
            "question_number": self.question["question_number"],
            "p45_field": self.question["p45_field"],
            "response_type": self.question["response_type"],
            "semantic_interpretation": self.question["semantic_interpretation"],
            "multi_response": self.question["multi_response"],
            "percentages_may_exceed_100": self.question["percentages_may_exceed_100"],
            "n_scope": self.n_scope,
            "n_completed": self.n_completed,
            "n_valid": self.n_valid,
            "n_missing": self.n_missing,
            "n_not_applicable": self.n_not_applicable,
            "n_dont_know": self.n_dont_know,
            "n_branch_not_shown": None,
            "branching_status": "NOT_IDENTIFIABLE_IN_CURRENT_TREATED_SOURCE",
            "options": options,
        }
        response_type_norm = normalize_for_match(self.question["response_type"])
        if "binaria" in response_type_norm:
            yes_count = sum(c for label, c in self.option_counts.items() if normalize_for_match(label).startswith("sim"))
            no_count = sum(c for label, c in self.option_counts.items() if normalize_for_match(label).startswith("nao"))
            payload["binary_summary"] = {
                "yes_count": yes_count,
                "yes_pct": pct(yes_count, self.n_valid, 4),
                "no_count": no_count,
                "no_pct": pct(no_count, self.n_valid, 4),
                "missing_count": self.n_missing,
            }
            if self.question["semantic_interpretation"] == "PERCEPTION":
                payload["perception_summary"] = {
                    "declared_yes_count": yes_count,
                    "declared_yes_pct": pct(yes_count, self.n_valid, 4),
                    "communication_rule": "Usar linguagem de declaração/percepção; não chamar de adequado automaticamente.",
                }
        return payload


def build_diagnostics(
    completed: dict[str, dict[str, Any]],
    questions: list[dict[str, Any]],
    coverage_rows: list[dict[str, Any]],
) -> tuple[dict[str, Any], dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    coverage_by_ibge = {r["ibge"]: r for r in coverage_rows}
    coverage_by_uf: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in coverage_rows:
        coverage_by_uf[row["uf"]].append(row)

    def make_stats(scope: dict[str, Any]) -> dict[str, QuestionStats]:
        return {q["question_number"]: QuestionStats(q, scope["eligible_schools"], scope["completed_schools"]) for q in questions}

    national_scope = {
        "eligible_schools": sum(r["eligible_schools"] for r in coverage_rows),
        "completed_schools": sum(r["completed_schools"] for r in coverage_rows),
    }
    national_stats = make_stats(national_scope)
    uf_stats: dict[str, dict[str, QuestionStats]] = {}
    for uf, rows in coverage_by_uf.items():
        uf_stats[uf] = make_stats(
            {
                "eligible_schools": sum(r["eligible_schools"] for r in rows),
                "completed_schools": sum(r["completed_schools"] for r in rows),
            }
        )
    mun_stats = {ibge: make_stats(row) for ibge, row in coverage_by_ibge.items()}

    q_by_field = {q["p45_field"]: q for q in questions}
    for school in completed.values():
        uf = school["uf"]
        ibge = school["ibge"]
        for field, value in school["answers_by_field"].items():
            q = q_by_field[field]["question_number"]
            national_stats[q].add_answer(value)
            uf_stats[uf][q].add_answer(value)
            if ibge in mun_stats:
                mun_stats[ibge][q].add_answer(value)

    national = {
        "scope": "BRASIL",
        "coverage": {
            "eligible_schools": national_scope["eligible_schools"],
            "completed_schools": national_scope["completed_schools"],
            "pending_schools": national_scope["eligible_schools"] - national_scope["completed_schools"],
            "coverage_pct": pct(national_scope["completed_schools"], national_scope["eligible_schools"]),
        },
        "questions": [national_stats[q["question_number"]].as_dict() for q in questions],
    }

    uf_payloads = {}
    for uf, stats in sorted(uf_stats.items()):
        rows = coverage_by_uf[uf]
        eligible = sum(r["eligible_schools"] for r in rows)
        completed_n = sum(r["completed_schools"] for r in rows)
        uf_payloads[uf] = {
            "scope": "UF",
            "uf": uf,
            "coverage": {
                "municipalities": len(rows),
                "eligible_schools": eligible,
                "completed_schools": completed_n,
                "pending_schools": eligible - completed_n,
                "coverage_pct": pct(completed_n, eligible),
            },
            "questions": [stats[q["question_number"]].as_dict() for q in questions],
        }

    mun_payloads = {}
    for ibge, stats in sorted(mun_stats.items()):
        row = coverage_by_ibge[ibge]
        mun_payloads[ibge] = {
            "scope": "MUNICIPIO",
            "ibge": ibge,
            "municipality": row["municipality"],
            "uf": row["uf"],
            "coverage": {
                "eligible_schools": row["eligible_schools"],
                "completed_schools": row["completed_schools"],
                "pending_schools": row["pending_schools"],
                "coverage_pct": row["coverage_pct"],
            },
            "small_n": {
                "threshold": SMALL_N_THRESHOLD,
                "status": SMALL_N_STATUS,
                "requires_review": True,
            },
            "questions": [stats[q["question_number"]].as_dict() for q in questions],
        }
    return national, uf_payloads, mun_payloads


def build_school_products(
    census_schools: dict[str, dict[str, Any]],
    completed: dict[str, dict[str, Any]],
    questions: list[dict[str, Any]],
) -> tuple[dict[str, list[dict[str, Any]]], dict[str, dict[str, Any]], dict[str, Any]]:
    q_by_field = {q["p45_field"]: q for q in questions}
    public_fields = {q["p45_field"] for q in questions if q["public_school_level_allowed"]}
    restricted_questions = [q for q in questions if not q["public_school_level_allowed"]]

    index_by_uf: dict[str, list[dict[str, Any]]] = defaultdict(list)
    partition_by_ibge: dict[str, dict[str, Any]] = {}
    stats = {
        "schools_total": 0,
        "completed": 0,
        "pending": 0,
        "answers_public_questions": len(public_fields),
        "answers_withheld_questions": len(restricted_questions),
        "restricted_question_numbers": [q["question_number"] for q in restricted_questions],
    }

    for code, base in sorted(census_schools.items(), key=lambda item: (item[1]["uf"], item[1]["municipality"], item[1]["school_name"], item[0])):
        comp = completed.get(code)
        status = "COMPLETED" if comp else "PENDING"
        stats["schools_total"] += 1
        stats["completed" if comp else "pending"] += 1
        localizacao = comp.get("localizacao") if comp else None
        response_date = comp.get("response_date") if comp else None

        index_record = {
            "inep": code,
            "school_name": base["school_name"],
            "municipality": base["municipality"],
            "ibge": base["ibge"],
            "uf": base["uf"],
            "response_status": status,
            "territorial_attributes": {
                "localizacao": {
                    "value": localizacao,
                    "source": "P45",
                    "availability": "completed_schools_only" if localizacao else "not_available",
                }
            },
        }
        index_by_uf[base["uf"]].append(index_record)

        answers: dict[str, Any] = {}
        withheld: list[dict[str, str]] = []
        for q in questions:
            qn = q["question_number"]
            if status == "PENDING":
                answers[qn] = None
                continue
            if q["p45_field"] not in public_fields:
                answers[qn] = None
                withheld.append(
                    {
                        "question_number": qn,
                        "p45_field": q["p45_field"],
                        "privacy_status": q["privacy_status"],
                        "reason": "Resposta não incluída no nível escola na W1.",
                    }
                )
            else:
                answers[qn] = comp["answers_by_field"].get(q["p45_field"])

        ibge = base["ibge"]
        if ibge not in partition_by_ibge:
            partition_by_ibge[ibge] = {
                "ibge": ibge,
                "municipality": base["municipality"],
                "uf": base["uf"],
                "question_numbers": [q["question_number"] for q in questions],
                "withheld_question_numbers": [q["question_number"] for q in restricted_questions],
                "schools": [],
            }
        partition_by_ibge[ibge]["schools"].append(
            {
                "inep": code,
                "school_name": base["school_name"],
                "ibge": ibge,
                "municipality": base["municipality"],
                "uf": base["uf"],
                "response_status": status,
                "response_date": response_date,
                "territorial_attributes": index_record["territorial_attributes"],
                "answers": answers,
                "withheld_questions": withheld,
            }
        )

    return index_by_uf, partition_by_ibge, stats


def read_active_summary() -> dict[str, Any]:
    if not CURRENT_JSON.exists():
        return {"status": "MISSING_CURRENT_JSON"}
    current = json.loads(CURRENT_JSON.read_text(encoding="utf-8"))
    release_id = current.get("release_id")
    summary_path = ACTIVE_RELEASES_DIR / str(release_id) / "marts" / "data" / "aplicacao" / "resumo_geral.json"
    ufs_path = ACTIVE_RELEASES_DIR / str(release_id) / "marts" / "data" / "aplicacao" / "ufs.json"
    if not summary_path.exists():
        return {"status": "MISSING_ACTIVE_SUMMARY", "release_id": release_id}
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    uf_rows = json.loads(ufs_path.read_text(encoding="utf-8")) if ufs_path.exists() else []
    return {
        "status": "OK",
        "release_id": release_id,
        "summary_path": str(summary_path),
        "summary": {
            "municipalities": int_value(summary.get("municipios")),
            "ufs": int_value(summary.get("ufs")),
            "eligible_schools": int_value(summary.get("escolas_elegiveis")),
            "completed_schools": int_value(summary.get("escolas_respondentes")),
            "pending_schools": int_value(summary.get("escolas_pendentes")),
            "coverage_pct": float_value(summary.get("cobertura")),
        },
        "ufs": uf_rows,
    }


def active_municipality_rows(release_id: str) -> dict[str, dict[str, Any]]:
    base = ACTIVE_RELEASES_DIR / release_id / "marts" / "data" / "aplicacao" / "municipios"
    out: dict[str, dict[str, Any]] = {}
    if not base.exists():
        return out
    for path in base.glob("*.json"):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        rows = payload if isinstance(payload, list) else payload.get("municipios", payload.get("municipalities", []))
        for row in rows:
            ibge = str(row.get("codigo_ibge") or row.get("ibge") or "")
            if not ibge:
                continue
            eligible = int_value(row.get("escolas_elegiveis", row.get("eligible_schools", 0)))
            completed = int_value(row.get("escolas_respondentes", row.get("escolas_finalizadas", row.get("completed_schools", 0))))
            pending = int_value(row.get("escolas_pendentes", row.get("pending_schools", max(eligible - completed, 0))))
            out[ibge] = {
                "ibge": ibge,
                "municipality": row.get("municipio", row.get("municipality", "")),
                "uf": row.get("uf", path.stem),
                "eligible_schools": eligible,
                "completed_schools": completed,
                "pending_schools": pending,
                "coverage_pct": float_value(row.get("cobertura", row.get("coverage_pct", pct(completed, eligible)))),
            }
    return out


def build_comparison(active: dict[str, Any], candidate_totals: dict[str, Any], uf_rows: list[dict[str, Any]], municipal_rows: list[dict[str, Any]]) -> dict[str, Any]:
    active_summary = active.get("summary", {})
    def delta(cand: dict[str, Any], prev: dict[str, Any]) -> dict[str, Any]:
        return {
            "municipalities": cand.get("municipalities", 0) - prev.get("municipalities", 0),
            "ufs": cand.get("ufs", 0) - prev.get("ufs", 0),
            "eligible_schools": cand.get("eligible_schools", 0) - prev.get("eligible_schools", 0),
            "completed_schools": cand.get("completed_schools", 0) - prev.get("completed_schools", 0),
            "pending_schools": cand.get("pending_schools", 0) - prev.get("pending_schools", 0),
            "coverage_pp": round(cand.get("coverage_pct", 0) - prev.get("coverage_pct", 0), 2),
        }

    active_ufs = {}
    for row in active.get("ufs", []):
        uf = row.get("uf")
        eligible = int_value(row.get("escolas_elegiveis"))
        completed = int_value(row.get("escolas_respondentes"))
        active_ufs[uf] = {
            "uf": uf,
            "eligible_schools": eligible,
            "completed_schools": completed,
            "pending_schools": int_value(row.get("escolas_pendentes")),
            "coverage_pct": float_value(row.get("cobertura", pct(completed, eligible))),
        }
    candidate_ufs = {row["uf"]: row for row in uf_rows}
    top_ufs = []
    for uf, cand in candidate_ufs.items():
        prev = active_ufs.get(uf, {"eligible_schools": 0, "completed_schools": 0, "pending_schools": 0, "coverage_pct": 0})
        top_ufs.append({"uf": uf, "delta": delta(cand, prev), "candidate": cand, "active": prev})
    top_ufs = sorted(top_ufs, key=lambda i: abs(i["delta"]["completed_schools"]), reverse=True)[:10]

    active_muns = active_municipality_rows(str(active.get("release_id", ""))) if active.get("release_id") else {}
    top_muns = []
    for cand in municipal_rows:
        prev = active_muns.get(cand["ibge"], {"eligible_schools": 0, "completed_schools": 0, "pending_schools": 0, "coverage_pct": 0})
        item_delta = delta(cand, prev)
        if any(item_delta[k] for k in ["eligible_schools", "completed_schools", "pending_schools"]) or item_delta["coverage_pp"]:
            top_muns.append({"ibge": cand["ibge"], "municipality": cand["municipality"], "uf": cand["uf"], "delta": item_delta})
    top_muns = sorted(top_muns, key=lambda i: abs(i["delta"]["completed_schools"]), reverse=True)[:20]

    documented_snapshot = None
    manifest = ROOT / "data" / "aplicacao" / "escolas" / "manifest_escolas.json"
    if manifest.exists():
        try:
            doc = json.loads(manifest.read_text(encoding="utf-8"))
            documented_snapshot = {
                "source": str(manifest),
                "data_base": doc.get("data_base"),
                "municipalities": int_value(doc.get("municipios_gerados", doc.get("particoes_geradas", 0))),
                "ufs": int_value(doc.get("ufs_geradas", 0)),
                "eligible_schools": int_value(doc.get("escolas_elegiveis")),
                "completed_schools": int_value(doc.get("escolas_finalizadas")),
                "pending_schools": int_value(doc.get("escolas_pendentes")),
                "coverage_pct": float_value(doc.get("cobertura_percentual")),
            }
        except json.JSONDecodeError:
            documented_snapshot = {"source": str(manifest), "status": "JSON_ERROR"}

    comparison = {
        "active_release_actual": {
            "release_id": active.get("release_id"),
            "status": active.get("status"),
            **active_summary,
        },
        "candidate": candidate_totals,
        "delta_vs_active_release_actual": delta(candidate_totals, active_summary) if active_summary else None,
        "documented_previous_nominal_snapshot": documented_snapshot,
        "delta_vs_documented_previous_nominal_snapshot": delta(candidate_totals, documented_snapshot) if isinstance(documented_snapshot, dict) and documented_snapshot.get("eligible_schools") else None,
        "top_ufs_by_completed_delta": top_ufs,
        "top_municipalities_by_completed_delta": top_muns,
        "notes": [
            "Comparação principal usa a release ativa indicada por data/current.json.",
            "O manifesto nominal local de 2026-08-06 é registrado separadamente porque traz os valores 34.236/19.319/63,93 citados em auditorias anteriores, mas não é o ponteiro ativo current.json.",
        ],
    }
    return comparison


def logical_role(relative_path: str) -> str:
    if relative_path == "metadata.json":
        return "metadata"
    if relative_path.startswith("monitoramento/"):
        return "monitoramento"
    if relative_path.startswith("diagnostico/questions"):
        return "diagnostico_questions"
    if relative_path.startswith("diagnostico/uf"):
        return "diagnostico_uf"
    if relative_path.startswith("diagnostico/municipios"):
        return "diagnostico_municipal"
    if relative_path.startswith("escolas/index"):
        return "school_index"
    if relative_path.startswith("escolas/estrategicas"):
        return "school_strategic_matrix"
    if relative_path.startswith("validation/privacy"):
        return "privacy_report"
    if relative_path.startswith("validation/comparison"):
        return "active_comparison"
    if relative_path.startswith("validation/validation"):
        return "validation_report"
    if relative_path.startswith("README"):
        return "readme"
    return "other"


def build_integrity_manifest(release_dir: Path) -> dict[str, Any]:
    files = []
    excluded = {"validation/integrity_manifest.json"}
    for path in sorted(p for p in release_dir.rglob("*") if p.is_file()):
        rel = path.relative_to(release_dir).as_posix()
        if rel in excluded:
            continue
        files.append(
            {
                "relative_path": rel,
                "bytes": path.stat().st_size,
                "sha256": sha256_file(path),
                "logical_role": logical_role(rel),
            }
        )
    manifest = {
        "schema_version": 1,
        "generated_at": now_iso(),
        "files_count": len(files),
        "files": files,
        "exclusions": sorted(excluded),
    }
    return manifest


def scan_reparse_points(path: Path) -> list[str]:
    # No Windows, reparse points aparecem com FILE_ATTRIBUTE_REPARSE_POINT.
    # Em outros sistemas, is_symlink cobre o caso relevante.
    found = []
    for item in path.rglob("*"):
        try:
            is_reparse = bool(os.stat(item, follow_symlinks=False).st_file_attributes & 0x400)  # type: ignore[attr-defined]
        except AttributeError:
            is_reparse = item.is_symlink()
        except OSError:
            is_reparse = False
        if is_reparse:
            found.append(str(item.relative_to(path)))
    return found


def create_readme(release_id: str, metadata: dict[str, Any], comparison: dict[str, Any], privacy: dict[str, Any]) -> str:
    totals = metadata["totals"]
    return f"""# Release candidata WASH — {release_id}

Gerado em: {metadata['generated_at']}

Esta release não está ativa e data/current.json não aponta para ela.

## Fonte

A release candidata foi derivada da camada P45 tratada/canônica de {metadata['source_date']}, sem consultar API externa e sem criar ingestão paralela.

SHA256 combinado das fontes: `{metadata['source_sha256']}`.

## Universo

- Municípios: {totals['municipalities']}
- UFs: {totals['ufs']}
- Escolas elegíveis: {totals['eligible_schools']}
- Escolas finalizadas: {totals['completed_schools']}
- Escolas pendentes: {totals['pending_schools']}
- Cobertura: {totals['coverage_pct']}%
- Perguntas estratégicas: {metadata['strategic_question_count']}
- Perguntas disponíveis na fonte tratada atual: {metadata['p45_question_count_available']}

## Estrutura

- `metadata.json`
- `monitoramento/`
- `diagnostico/`
- `escolas/`
- `validation/`

## Diferenças para a release ativa

Release ativa lida de `data/current.json`: `{comparison['active_release_actual'].get('release_id')}`.

Diferença principal vs release ativa:

```json
{json.dumps(comparison.get('delta_vs_active_release_actual'), ensure_ascii=False, indent=2)}
```

## Privacidade

Gate de privacidade: `{privacy['privacy_gate']}`.

Questões restringidas no nível escolar:

{chr(10).join(f"- Q{item['question_number']} — {item['p45_field']}: {item['privacy_status']}" for item in privacy['restricted_questions'])}

A regra de small-N suppression permanece `null` com status `PENDING_PRIVACY_POLICY`. Esta release candidata não deve ser promovida para publicação final sem homologação de privacidade.

## Como validar

```powershell
python -B scripts\\validar_release_candidata_wash.py --release-dir data\\staging\\{release_id} --write-report
```

## Como promover futuramente

Promoção não faz parte da W1. Em onda posterior, após homologação técnica e de privacidade, a pasta candidata poderá ser copiada/promovida para `data/releases/<release_id>/` e só então `data/current.json` poderá ser atualizado atomicamente.
"""


def create_w1_doc(release_dir: Path, metadata: dict[str, Any], validation: dict[str, Any], comparison: dict[str, Any], privacy: dict[str, Any], file_count: int, total_bytes: int) -> str:
    totals = metadata["totals"]
    return f"""# W1 — Dados comuns e release candidata WASH

Gerado em: {metadata['generated_at']}

## Gate

`{validation['gate']}`

## Objetivo

Construir uma release candidata em staging para a nova arquitetura do `dashboard_autoavaliacao`, sem promover para produção e sem alterar `data/current.json`.

## Fonte

- Data da fonte P45 tratada: {metadata['source_date']}
- SHA256 combinado das fontes: `{metadata['source_sha256']}`
- Perguntas disponíveis na fonte tratada atual: {metadata['p45_question_count_available']}
- Estrutura usada: fato longo para auditoria, base larga de resposta válida por escola para respostas, cobertura municipal para monitoramento e dimensão Censo 2025 para universo elegível.

## Scripts

- `scripts/build_release_candidata_wash.py`
- `scripts/validar_release_candidata_wash.py`

## Outputs

- Staging: `{release_dir.as_posix()}`
- Arquivos gerados na release candidata: {file_count}
- Tamanho total aproximado: {total_bytes} bytes
- Partições municipais de diagnóstico: {validation['summary']['diagnostic_municipal_partitions']}
- Partições escolares estratégicas: {validation['summary']['school_partitions']}

## Totais

- Municípios: {totals['municipalities']}
- UFs: {totals['ufs']}
- Escolas elegíveis: {totals['eligible_schools']}
- Escolas finalizadas: {totals['completed_schools']}
- Escolas pendentes: {totals['pending_schools']}
- Cobertura: {totals['coverage_pct']}%

## Comparação com release ativa

```json
{json.dumps(comparison.get('delta_vs_active_release_actual'), ensure_ascii=False, indent=2)}
```

Observação: a comparação principal usa a release ativa apontada por `data/current.json`. O snapshot nominal local de 06/08/2026, quando presente, é registrado separadamente em `validation/comparison_with_active_release.json`.

## Privacidade

- Gate: `{privacy['privacy_gate']}`
- Small-N suppression: `{privacy['small_n_suppression']['status']}`
- Threshold: `{privacy['small_n_suppression']['threshold']}`
- Questões restringidas no nível escola: {', '.join('Q' + item['question_number'] for item in privacy['restricted_questions'])}

## Pendências

- Homologar regra institucional de small-N.
- Homologar publicação ou não de respostas no nível escola.
- Confirmar se atributos territoriais sensíveis podem aparecer apenas agregados.
- Implementar W2 consumindo exclusivamente esta release candidata.

## Próximo passo

W2 — implementação da aba Diagnóstico WASH consumindo exclusivamente a release candidata validada, ainda sem promoção para `current.json`.
"""


def main() -> None:
    parser = argparse.ArgumentParser(description="Gera release candidata WASH em data/staging.")
    parser.add_argument("--source", default=str(DEFAULT_SOURCE), help="Diretório da fonte P45 tratada ou arquivo fato com data no nome.")
    parser.add_argument("--output-root", default=str(DEFAULT_OUTPUT_ROOT), help="Raiz do staging.")
    parser.add_argument("--censo-reference-year", type=int, default=2025, help="Ano do Censo usado como referência.")
    parser.add_argument("--dry-run", action="store_true", help="Audita entradas e imprime plano sem escrever staging.")
    parser.add_argument("--strict", action="store_true", help="Falha em inconsistências estruturais.")
    args = parser.parse_args()

    source_date, sources = resolve_sources(Path(args.source).resolve())
    current_sha_before = sha256_file(CURRENT_JSON)
    source_stats = {key: file_stats(path, key) for key, path in sources.items()}
    source_sha = combined_source_hash(source_stats, args.censo_reference_year)
    release_candidate_id = f"d{source_date[2:4]}{source_date[5:7]}{source_date[8:10]}_{source_sha[:6]}"
    output_root = Path(args.output_root).resolve()
    final_dir = output_root / release_candidate_id
    temp_dir = output_root / f".__tmp_wash_{release_candidate_id}"

    if args.dry_run:
        print(json.dumps({
            "release_candidate_id": release_candidate_id,
            "source_date": source_date,
            "source_sha256": source_sha,
            "output_root": str(output_root),
            "final_dir": str(final_dir),
            "source_stats": source_stats,
        }, ensure_ascii=False, indent=2))
        return

    if final_dir.exists():
        raise FileExistsError(f"Release candidata já existe; não sobrescrevi: {final_dir}")
    output_root.mkdir(parents=True, exist_ok=True)
    safe_rmtree(temp_dir, output_root)
    temp_dir.mkdir(parents=True, exist_ok=False)

    matrix_rows = read_matrix()
    dim_flags = read_dim_flags(sources["dim_questions"])
    questions = question_catalog(matrix_rows, dim_flags)
    coverage_rows = read_coverage(sources["coverage_municipal"])
    totals, uf_rows, municipal_rows = summarize_monitoring(coverage_rows)
    census_schools = read_census_schools(sources["census_school_dimension"])
    completed, completed_stats = read_completed_wide(sources["valid_response_wide"], questions)

    if args.strict:
        if len(census_schools) != totals["eligible_schools"]:
            raise ValueError(f"Censo elegível ({len(census_schools)}) não reconcilia com cobertura ({totals['eligible_schools']}).")
        if len(completed) != totals["completed_schools"]:
            raise ValueError(f"Respostas finalizadas ({len(completed)}) não reconciliam com cobertura ({totals['completed_schools']}).")

    national_diag, uf_diag, municipal_diag = build_diagnostics(completed, questions, coverage_rows)
    school_index, school_partitions, school_stats = build_school_products(census_schools, completed, questions)
    active = read_active_summary()
    comparison = build_comparison(active, totals, uf_rows, municipal_rows)

    source_audit = {
        "source_date": source_date,
        "source_path_or_logical_identifier": str(Path(args.source).resolve()),
        "source_files": source_stats,
        "source_sha256": source_sha,
        "current_json_sha256_before": current_sha_before,
        "rows": {
            "coverage_municipal": source_stats["coverage_municipal"]["rows_estimated"],
            "valid_response_wide": source_stats["valid_response_wide"]["rows_estimated"],
            "census_school_dimension": source_stats["census_school_dimension"]["rows_estimated"],
            "fact_items_long": source_stats["fact_items_long"]["rows_estimated"],
        },
        "schools": {
            "eligible_from_census_dimension": len(census_schools),
            "completed_from_valid_response_wide": len(completed),
        },
        "municipalities": totals["municipalities"],
        "ufs": totals["ufs"],
        "max_response_date": completed_stats["max_response_date"],
        "questions_available_in_current_treated_source": completed_stats["response_question_columns_available"],
        "structure_used": {
            "diagnostic_answers": "wide: pesquisa_45_resposta_valida_por_escola_<date>.csv",
            "question_availability_audit": "wide response columns; long fact row count retained in source audit",
            "coverage": "municipal aggregate",
            "school_universe": "census school dimension filtered to active municipal eligible PCJ schools",
        },
    }

    privacy_report = {
        "privacy_gate": "PASS-WITH-LIMITATIONS",
        "privacy_contract_version": PRIVACY_CONTRACT_VERSION,
        "fields_excluded": PERSONAL_FIELDS_EXCLUDED,
        "restricted_questions": [
            {
                "question_number": q["question_number"],
                "p45_field": q["p45_field"],
                "privacy_status": q["privacy_status"],
                "source_publication_granularity": q["source_publication_granularity"],
                "source_sensitive_flag": q["source_sensitive_flag"],
                "school_level_answer_included": False,
            }
            for q in questions if not q["public_school_level_allowed"]
        ],
        "aggregate_only_questions": [
            {
                "question_number": q["question_number"],
                "p45_field": q["p45_field"],
                "privacy_status": q["privacy_status"],
            }
            for q in questions if not q["public_school_level_allowed"]
        ],
        "school_level_included_questions": [
            q["question_number"] for q in questions if q["public_school_level_allowed"]
        ],
        "small_n_suppression": {
            "threshold": SMALL_N_THRESHOLD,
            "status": SMALL_N_STATUS,
            "decision": "Não foi localizada regra institucional de small-N; nenhum threshold definitivo foi inventado.",
        },
        "pending_items": [
            "Homologar política institucional de supressão de pequenos N.",
            "Homologar publicação de respostas por escola antes de qualquer release pública.",
            "Confirmar tratamento de atributos territoriais sensíveis indígena/quilombola/comunidade tradicional.",
        ],
        "risks": [
            "A dimensão P45 marca 3 das 31 questões como condicionais a agregado com supressão e homologação.",
            "A publicação nominal por escola deve permanecer candidata/validada internamente até decisão de privacidade.",
        ],
    }

    metadata = {
        "release_candidate_id": release_candidate_id,
        "status": "STAGING_VALIDATED_WITH_LIMITATIONS",
        "gate": "PASS-WITH-LIMITATIONS-W1-AUTOAVALIACAO-WASH-DATA-RELEASE-CANDIDATE",
        "generated_at": now_iso(),
        "source_date": source_date,
        "source_path_or_logical_identifier": str(Path(args.source).resolve()),
        "source_sha256": source_sha,
        "p45_question_count_available": completed_stats["response_question_columns_available"],
        "strategic_question_count": 31,
        "censo_reference_year": args.censo_reference_year,
        "semantic_contract_version": SEMANTIC_CONTRACT_VERSION,
        "privacy_contract_version": PRIVACY_CONTRACT_VERSION,
        "data_reference_date": completed_stats["max_response_date"][:10],
        "totals": totals,
        "source_audit": source_audit,
        "release_convention_audit": {
            "existing_release_ids": [p.name for p in sorted(ACTIVE_RELEASES_DIR.iterdir()) if p.is_dir()] if ACTIVE_RELEASES_DIR.exists() else [],
            "convention_used": "dYYMMDD_<hash6>, seguindo releases ativas como d260801_ff2a82.",
            "hash_basis": "SHA256 combinado das fontes tratadas, matriz estratégica e parâmetro censo_reference_year.",
        },
        "publication_status": {
            "active": False,
            "current_json_points_to_this_release": False,
            "promotion_allowed_in_w1": False,
        },
    }

    write_json(temp_dir / "metadata.json", metadata, pretty=True)
    write_json(temp_dir / "monitoramento" / "resumo_nacional.json", {"scope": "BRASIL", **totals, "meta_rule": {"target_pct": 90, "rounding": "ceil(0.90 * eligible_schools)"}}, pretty=True)
    write_json(temp_dir / "monitoramento" / "resumo_uf.json", {"ufs": uf_rows}, pretty=True)
    write_json(temp_dir / "monitoramento" / "resumo_municipal.json", {"municipalities": municipal_rows}, pretty=False)
    write_json(temp_dir / "diagnostico" / "questions.json", {"questions": questions}, pretty=True)
    write_json(temp_dir / "diagnostico" / "national.json", national_diag, pretty=False)
    for uf, payload in uf_diag.items():
        write_json(temp_dir / "diagnostico" / "uf" / f"{uf}.json", payload, pretty=False)
    for ibge, payload in municipal_diag.items():
        write_json(temp_dir / "diagnostico" / "municipios" / f"{ibge}.json", payload, pretty=False)
    for uf, records in school_index.items():
        write_json(temp_dir / "escolas" / "index" / f"{uf}.json", {"uf": uf, "schools": records}, pretty=False)
    for ibge, payload in school_partitions.items():
        uf = payload["uf"]
        write_json(temp_dir / "escolas" / "estrategicas" / uf / f"{ibge}.json", payload, pretty=False)
    write_json(temp_dir / "validation" / "privacy_report.json", privacy_report, pretty=True)
    write_json(temp_dir / "validation" / "comparison_with_active_release.json", comparison, pretty=True)
    (temp_dir / "README_RELEASE_CANDIDATE.md").write_text(create_readme(release_candidate_id, metadata, comparison, privacy_report), encoding="utf-8")

    validation = validate_release(temp_dir, write_report=True)
    if validation["validation_status"] == "HOLD":
        print(json.dumps(validation, ensure_ascii=False, indent=2))
        raise SystemExit(1)

    integrity = build_integrity_manifest(temp_dir)
    write_json(temp_dir / "validation" / "integrity_manifest.json", integrity, pretty=True)
    integrity_sha = sha256_file(temp_dir / "validation" / "integrity_manifest.json")
    validation_report_path = temp_dir / "validation" / "validation_report.json"
    validation_report = json.loads(validation_report_path.read_text(encoding="utf-8"))
    validation_report["integrity_manifest_sha256"] = integrity_sha
    validation_report["reparse_points_found"] = scan_reparse_points(temp_dir)
    validation_report["node_modules_found"] = [str(p.relative_to(temp_dir)) for p in temp_dir.rglob("node_modules")]
    write_json(validation_report_path, validation_report, pretty=True)

    total_bytes = sum(p.stat().st_size for p in temp_dir.rglob("*") if p.is_file())
    file_count = sum(1 for p in temp_dir.rglob("*") if p.is_file())
    W1_DOC.write_text(create_w1_doc(temp_dir, metadata, validation_report, comparison, privacy_report, file_count, total_bytes), encoding="utf-8")

    current_sha_after = sha256_file(CURRENT_JSON)
    if current_sha_after != current_sha_before:
        raise RuntimeError("HOLD: data/current.json mudou durante a geração.")

    temp_dir.replace(final_dir)

    final_report = {
        "gate": validation_report["gate"],
        "release_candidate_id": release_candidate_id,
        "staging_path": str(final_dir),
        "source_sha256": source_sha,
        "totals": totals,
        "files_generated": file_count,
        "total_bytes": total_bytes,
        "diagnostic_municipal_partitions": validation_report["summary"]["diagnostic_municipal_partitions"],
        "school_partitions": validation_report["summary"]["school_partitions"],
        "privacy_gate": privacy_report["privacy_gate"],
        "restricted_questions": [item["question_number"] for item in privacy_report["restricted_questions"]],
        "current_json_sha256_before": current_sha_before,
        "current_json_sha256_after": current_sha_after,
        "w1_doc": str(W1_DOC),
    }
    print(json.dumps(final_report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
