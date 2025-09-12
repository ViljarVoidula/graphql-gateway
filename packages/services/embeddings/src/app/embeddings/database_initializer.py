from __future__ import annotations
from typing import Dict, Any, Optional, List


class _DatabaseInitializerStub:
    async def save_vector_column_settings(self, table_name: str, column_name: str, model_name: str, combined_fields: Optional[Dict[str, Any]] = None):
        return None

    async def get_vector_column_settings(self, table_name: str, column_name: str) -> Optional[Dict[str, Any]]:
        return None

    async def list_vector_tables(self) -> List[str]:
        return []

    async def get_table_vector_columns(self, table_name: str) -> List[Dict[str, Any]]:
        return []


database_initializer = _DatabaseInitializerStub()
