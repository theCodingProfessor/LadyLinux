from __future__ import annotations

from fastapi import APIRouter

from api_layer.services import firewall_service

router = APIRouter(prefix="/api/firewall", tags=["firewall"])


@router.get("/status")
def get_firewall_status() -> dict:
    return firewall_service.firewall_status()


@router.get("/rules")
def get_firewall_rules() -> dict:
    return firewall_service.firewall_rules()


@router.get("/rule/{rule_id}")
def get_firewall_rule(rule_id: str) -> dict:
    return firewall_service.firewall_rule(rule_id)


@router.post("/reload")
def reload_firewall() -> dict:
    return firewall_service.firewall_reload()
