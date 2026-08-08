// ============================================================
// Homework: ReactJS Deployment Pipeline
// Flow (from diagram):
//   Dev --push--> Git --Triggers--> Jenkins --> Test --> Build
//        --> Push --> Dockerhub --> Deploy --> Add Domain with Https
//                                              (only if first run)
// ============================================================

pipeline {
    agent any

    tools {
        nodejs 'nodejs-20'
    }

    // "Configure Webhook" in the diagram:
    // GitHub webhook -> http://jenkins.vakhim-dev.site/github-webhook/
    triggers {
        githubPush()
    }

    parameters {
        booleanParam(
            name: 'RUN_TEST',
            defaultValue: false, // no "test" script in package.json yet
            description: 'Run npm test before building?'
        )
    }

    // declaring variable
    environment {
        TAG      = "v1.0.${env.BUILD_NUMBER}"      // built-in
        IMG_NAME = "jenkins-g12-reactjs"
        DH_USER  = "vakhim11"

        FULL_IMG = "${DH_USER}/${IMG_NAME}:${TAG}"

        // Deploy + domain config
        APP_NAME    = "reactjs-app"
        APP_PORT    = "3000"
        DOMAIN      = "reactjs.vakhim-dev.site"
        NGINX_CONF  = "/etc/nginx/conf.d/reactjs.conf"
    }

    stages {

        // ---------- Git / Checkout ----------
        stage("Checkout") {
            steps {
                git 'https://github.com/nuonvakhim/Expense-Tracking.git'
            }
        }

        // ---------- Test ----------
        stage('Test') {
            when {
                expression {
                    params.RUN_TEST == true
                }
            }
            steps {
                sh """
                node -v
                npm -v
                echo "RUN_TEST IS: ${params.RUN_TEST}"
                npm i          # install dependencies
                npm run test   # run test
                """
            }
        }

        // ---------- Build ----------
        stage('Build') {
            steps {
                sh "ls -lrt "
                sh """
                docker build -t ${FULL_IMG} -f prod.Dockerfile .
                """
            }
        }

        // ---------- Push to Dockerhub ----------
        stage("Push") {
            steps {
                withCredentials([usernamePassword(credentialsId: 'DH_CREDIT', passwordVariable: 'PASSWORD', usernameVariable: 'USERNAME')]) {
                    sh """
                    echo "${PASSWORD}" | docker login -u ${USERNAME} --password-stdin
                    docker push "${FULL_IMG}"
                    """
                }
            }
        }

        // ---------- Deploy ----------
        stage('Deploy') {
            steps {
                sh """
                docker stop ${APP_NAME} || true
                docker rm ${APP_NAME} || true
                docker run -dp ${APP_PORT}:80 --name ${APP_NAME} ${FULL_IMG}
                """
            }
        }

        // ---------- Add Domain with Https (only if first run) ----------
        stage('Add Domain with Https') {
            when {
                // Only runs when the nginx conf does not exist yet = first run
                expression {
                    return sh(script: "test -f ${NGINX_CONF}", returnStatus: true) != 0
                }
            }
            steps {
                sh """
                # 1) create nginx reverse proxy for the react app
                sudo tee ${NGINX_CONF} > /dev/null <<'EOF'
server {
    listen 80;
    server_name ${DOMAIN};

    location / {
        proxy_pass http://localhost:${APP_PORT};

        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

                # 2) test + reload nginx
                sudo nginx -t
                sudo systemctl reload nginx

                # 3) add https with certbot (it will rewrite the conf above)
                sudo certbot --nginx -d ${DOMAIN} --non-interactive --agree-tos -m admin@${DOMAIN} --redirect

                sudo systemctl reload nginx
                """
            }
        }
    }

    post {
        success {
            echo "Deployed ${FULL_IMG} -> https://${DOMAIN}"
        }
        failure {
            echo "Pipeline FAILED. Check the stage log above."
        }
        always {
            sh "docker logout || true"
        }
    }
}
