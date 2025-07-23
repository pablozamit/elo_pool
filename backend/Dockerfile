# Usar una imagen oficial de Python
FROM python:3.11-slim

# Establecer el directorio de trabajo
WORKDIR /app

# Copiar e instalar las dependencias
COPY requirements.txt .
RUN pip install -r requirements.txt psycopg2-binary

# Copiar el resto del código del backend
COPY . .

# El comando para arrancar el servidor
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8080"]
