#!/usr/bin/env python3
import psycopg2
import os
import sys
from pathlib import Path

def get_db_connection():
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        print("❌ Error: DATABASE_URL no configurada")
        sys.exit(1)
    
    try:
        conn = psycopg2.connect(database_url)
        return conn
    except Exception as e:
        print(f"❌ Error conectando a la base de datos: {e}")
        sys.exit(1)

def run_migration():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    schema_path = Path(__file__).parent.parent / 'schema.sql'
    
    if not schema_path.exists():
        print(f"❌ Error: No se encuentra schema.sql en {schema_path}")
        sys.exit(1)
    
    with open(schema_path, 'r') as f:
        schema_sql = f.read()
    
    try:
        cursor.execute(schema_sql)
        conn.commit()
        print("✅ Migración completada exitosamente")
    except Exception as e:
        conn.rollback()
        print(f"❌ Error ejecutando migración: {e}")
        sys.exit(1)
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    run_migration()
