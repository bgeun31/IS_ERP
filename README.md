# 백엔드 재시작 (devices_router.py 변경 반영)
sudo docker restart is-erp-backend

# 프론트엔드 재빌드 (DashboardPage.tsx 변경 반영)
sudo docker-compose build --no-cache frontend
sudo docker stop is-erp-frontend && sudo docker rm is-erp-frontend && sudo docker-compose up --no-deps -d frontend

# IP 주소로 접속 포워딩
sudo iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 3000
sudo iptables -t nat -A OUTPUT -p tcp --dport 80 -j REDIRECT --to-port 3000
sudo netfilter-persistent save
