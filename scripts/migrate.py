#!/usr/bin/env python3
"""
Script de migración para SmartClienteRD IA
Crea las tablas en PostgreSQL automáticamente
Ejecutar: python scripts/migrate.py
"""

import os
import sys
import asyncio
from pathlib import Path

# Agregar directorio padre al path para importar configuración
sys.path.insert(0, str(Path(__file__).parent.parent))

import asyncpg
from dotenv import load_dotenv

# Cargar variables de entorno
load_dotenv()

# Colores para output en consola
class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'

def print_success(msg):
    print(f"{Colors.GREEN}✅ {msg}{Colors.RESET}")

def print_error(msg):
    print(f"{Colors.RED}❌ {msg}{Colors.RESET}")

def print_info(msg):
    print(f"{Colors.BLUE}ℹ️ {msg}{Colors.RESET}")

def print_warning(msg):
    print(f"{Colors.YELLOW}⚠️ {msg}{Colors.RESET}")

async def migrate():
    """Ejecuta la migración de la base de datos"""
    
    print(f"\n{Colors.BLUE}{'='*60}{Colors.RESET}")
    print(f"{Colors.BLUE}   🚀 SmartClienteRD IA - Migración de Base de Datos{Colors.RESET}")
    print(f"{Colors.BLUE}{'='*60}{Colors.RESET}\n")
    
    # Obtener URL de la base de datos
    database_url = os.getenv('DATABASE_URL')
    
    if not database_url:
        print_error("No se encontró DATABASE_URL en las variables de entorno")
        print_info("Asegúrate de tener un archivo .env con DATABASE_URL")
        print_info("Ejemplo: DATABASE_URL=postgresql://user:pass@localhost:5432/smartclienterd")
        sys.exit(1)
    
    print_info(f"Conectando a la base de datos...")
    
    try:
        # Conectar a la base de datos
        conn = await asyncpg.connect(database_url)
        print_success("Conexión establecida")
        
        # Leer el archivo schema.sql
        schema_path = Path(__file__).parent.parent / "schema.sql"
        
        if not schema_path.exists():
            print_error(f"No se encontró el archivo schema.sql en {schema_path}")
            print_info("Debes crear el archivo schema.sql con la definición de las tablas")
            sys.exit(1)
        
        print_info(f"Leyendo schema.sql desde {schema_path}")
        
        with open(schema_path, 'r', encoding='utf-8') as f:
            sql = f.read()
        
        print_info("Ejecutando creación de tablas...")
        
        # Ejecutar el SQL completo (pueden ser múltiples statements)
        # asyncpg ejecuta un statement a la vez, por lo que dividimos por ;
        statements = [s.strip() for s in sql.split(';') if s.strip()]
        
        for i, statement in enumerate(statements, 1):
            try:
                await conn.execute(statement)
                print(f"   ✓ Statement {i} ejecutado correctamente")
            except Exception as e:
                # Si es error de "already exists", lo ignoramos
                if "already exists" in str(e).lower():
                    print_warning(f"   Statement {i}: Ya existe (ignorado)")
                else:
                    raise e
        
        print_success("¡Migración completada con éxito!")
        
        # Verificar tablas creadas
        print_info("\nVerificando tablas creadas:")
        
        tables = [
            'users', 'clients', 'messages', 
            'ai_settings', 'plans', 'usage_logs', 'payments'
        ]
        
        for table in tables:
            try:
                result = await conn.fetch(f"SELECT COUNT(*) FROM {table}")
                count = result[0]['count']
                print_success(f"  📋 {table}: {count} registros")
            except Exception:
                print_error(f"  ❌ {table}: No encontrada")
        
        # Mostrar estadísticas
        print(f"\n{Colors.BLUE}{'='*60}{Colors.RESET}")
        print_success("🎉 Base de datos lista para usar")
        print_info("Ahora puedes iniciar el servidor: python app/main.py")
        print(f"{Colors.BLUE}{'='*60}{Colors.RESET}\n")
        
        await conn.close()
        
    except asyncpg.InvalidPasswordError:
        print_error("Contraseña incorrecta para la base de datos")
        print_info("Verifica DATABASE_URL en tu archivo .env")
        sys.exit(1)
    except asyncpg.CannotConnectNowError:
        print_error("No se pudo conectar a la base de datos")
        print_info("¿Está PostgreSQL corriendo? Revisa Railway o tu servidor local")
        sys.exit(1)
    except Exception as e:
        print_error(f"Error durante la migración: {str(e)}")
        sys.exit(1)

def main():
    """Punto de entrada principal"""
    asyncio.run(migrate())

if __name__ == "__main__":
    main()
