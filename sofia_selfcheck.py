# Módulo de Autoanálise - sofia_selfcheck.py
import subprocess
import time
from datetime import datetime, timedelta

class SelfCheck:
    def __init__(self):
        self.metrics = {'latency': []}
        self.interactions = []
        self.errors = []
        self.error_timestamps = []  # Para registrar timestamps de erros

    def record_interaction(self, user_input, response):
        self.interactions.append({'user_input': user_input, 'response': response})

    def record_error(self, error_message):
        self.errors.append(error_message)
        self.error_timestamps.append(datetime.now())  # Armazena o timestamp do erro

    def analyze_performance(self):
        # Exemplo de análise de desempenho
        performance_report = {
            'total_interactions': len(self.interactions),
            'total_errors': len(self.errors),
            'error_rate': len(self.errors) / len(self.interactions) if self.interactions else 0,
        }
        return performance_report

    def check_recent_errors(self):
        # Verifica erros nos logs
        try:
            logs = subprocess.check_output(['tail', '-n', '100', '/var/log/syslog'], text=True)
            errors = [line for line in logs.split('\n') if 'Erro' in line or 'Exception' in line or 'Falha' in line]
            return errors
        except Exception as e:
            return [f'Erro ao acessar logs: {str(e)}']

    def count_consecutive_failures(self):
        # Conta falhas consecutivas nas últimas 24 horas
        now = datetime.now()
        count = 0
        for timestamp in reversed(self.error_timestamps):  # Verificando os timestamps em ordem reversa
            if now - timestamp <= timedelta(hours=24):
                count += 1
            else:
                break  # Sai do loop se o timestamp for mais antigo que 24 horas
        return count

    def check_service_status(self, services):
        status_report = {}
        for service in services:
            try:
                status = subprocess.check_output(['systemctl', 'is-active', service], text=True).strip()
                status_report[service] = status
            except subprocess.CalledProcessError:
                status_report[service] = 'inativo'
        return status_report

    def check_resource_usage(self):
        resource_report = {'cpu_usage': None, 'memory_usage': None, 'disk_usage': None}
        try:
            # Verificando uso da CPU
            cpu_usage = subprocess.check_output(['grep', 'cpu ', '/proc/stat'], text=True)
            total_cpu = sum(map(int, cpu_usage.split()[1:]))
            idle_cpu = int(cpu_usage.split()[4])
            resource_report['cpu_usage'] = (1 - (idle_cpu / total_cpu)) * 100
        except Exception as e:
            resource_report['cpu_usage'] = f'Erro ao verificar CPU: {str(e)}'

        try:
            # Verificando uso da memória
            mem_usage = subprocess.check_output(['free', '-m'], text=True).splitlines()[1].split()
            total_memory = int(mem_usage[1])
            used_memory = int(mem_usage[2])
            resource_report['memory_usage'] = (used_memory / total_memory) * 100
        except Exception as e:
            resource_report['memory_usage'] = f'Erro ao verificar memória: {str(e)}'

        try:
            # Verificando uso do disco
            disk_usage = subprocess.check_output(['df', '-h', '/'], text=True).splitlines()[1].split()
            resource_report['disk_usage'] = float(disk_usage[4][:-1])  # Remove o '%' no final
        except Exception as e:
            resource_report['disk_usage'] = f'Erro ao verificar disco: {str(e)}'

        # Verifica se algum recurso está acima de 80%
        alerts = []
        if resource_report['cpu_usage'] and resource_report['cpu_usage'] > 80:
            alerts.append('Uso de CPU acima de 80%')
        if resource_report['memory_usage'] and resource_report['memory_usage'] > 80:
            alerts.append('Uso de memória acima de 80%')
        if resource_report['disk_usage'] and resource_report['disk_usage'] > 80:
            alerts.append('Uso de disco acima de 80%')

        resource_report['alerts'] = alerts
        return resource_report

    def record_latency(self, latency):
        self.metrics['latency'].append(latency)

    def calculate_average_latency(self):
        if self.metrics['latency']:
            return sum(self.metrics['latency']) / len(self.metrics['latency'])
        return 0

    def log_report(self, report):
        try:
            with open('/opt/sofia/logs/selfcheck.log', 'a') as log_file:
                log_file.write(f"{datetime.now()} - Relatório de Autoanálise:\n")
                log_file.write(f"Total de interações: {report['total_interactions']}\n")
                log_file.write(f"Total de erros: {report['total_errors']}\n")
                log_file.write(f"Taxa de erro: {report['error_rate']:.2f}\n")
                log_file.write(f"Erros recentes: {report['recent_errors']}\n")
                log_file.write(f"Status dos serviços: {report['service_status']}\n")
                log_file.write(f"Uso de recursos: {report['resource_usage']}\n")
                log_file.write(f"Média de latência: {report['average_latency']:.2f} ms\n")
                log_file.write(f"Falhas consecutivas: {report['consecutive_failures']}\n\n")

            # Exibe mensagem leve se houver problemas
            if report['resource_usage'].get('alerts') or report['service_status'].get('inativo'):
                print("Tudo bem, mas há alguns pontos a serem observados.")
        except Exception as e:
            print(f'Erro ao gravar no log: {str(e)}')

    def generate_report(self):
        report = self.analyze_performance()
        report['recent_errors'] = self.check_recent_errors()
        report['service_status'] = self.check_service_status(['postgresql', 'docker', 'ssh', 'cron', 'nginx', 'caddy'])
        report['resource_usage'] = self.check_resource_usage()
        report['average_latency'] = self.calculate_average_latency()
        report['consecutive_failures'] = self.count_consecutive_failures()
        self.log_report(report)  # Grava o relatório no log
        return report

# Exemplo de uso
if __name__ == '__main__':
    self_check = SelfCheck()
    self_check.record_interaction('Como está o sistema?', 'O sistema está funcionando normalmente.')
    self_check.record_error('Resposta não encontrada para a consulta.')
    # Simulação de latência
    self_check.record_latency(150)  # Exemplo de latência em ms
    self_check.record_latency(200)
    # Simulação de falhas
    self_check.record_error('Falha ao conectar ao banco de dados.')
    self_check.record_error('Falha na autenticação.')
    print(self_check.generate_report())
