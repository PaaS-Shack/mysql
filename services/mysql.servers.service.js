"use strict";
const DbService = require("db-mixin");
const ConfigLoader = require("config-mixin");
const { MoleculerClientError } = require("moleculer").Errors;
const MYSQLMixin = require('../mixins/mysql.mixins');
const generator = require('generate-password');

/**
 * attachments of addons service
 */
module.exports = {
	name: "mysql.servers",
	version: 1,

	mixins: [
		DbService({
			permissions: 'mysql.servers'
		}),
		ConfigLoader(['mysql.**']),
		MYSQLMixin
	],

	/**
	 * Service dependencies
	 */
	dependencies: [

	],

	/**
	 * Service settings
	 */
	settings: {
		rest: true,
		
		fields: {
			k8sCluster: {
				type: "string",
				required: true,
				empty: false,
			},
			namespace: {
				type: "string",
				required: true,
				empty: false,
			},
			uid: {
				type: "string",
				required: true,
				empty: false,
			},
			name: {
				type: "string",
				required: true,
				empty: false,
			},
			hostname: {
				type: "string",
				required: false
			},
			port: {
				type: "number",
				required: false
			},
			username: {
				type: "string",
				required: false
			},
			password: {
				type: "string",
				empty: false,
				required: false
			},
			zone: {
				type: "string",
				required: false
			},

			...DbService.FIELDS,// inject dbservice fields
		},

		// default database populates
		defaultPopulates: [],

		// database scopes
		scopes: {
			...DbService.SCOPE,// inject dbservice scope
		},

		// default database scope
		defaultScopes: [
			...DbService.DSCOPE,// inject dbservice dscope
		],

		// default init config settings
		config: {

		}
	},

	/**
	 * Actions
	 */

	actions: {


		//show server status
		//https://dev.mysql.com/doc/refman/8.0/en/show-status.html
		status: {
			rest: "GET /:id/status",
			permissions: ['mysql.servicers.status'],
			params: {
				id: { type: "string", optional: false },
			},
			async handler(ctx) {
				const params = Object.assign({}, ctx.params);

				const server = await ctx.call('v1.mysql.servers.resolve', { id: ctx.params.id });

				if (!server)
					throw new MoleculerClientError("Server not found", 404);

				return this.execQuery(server, `SHOW STATUS;`);
			}
		},
		//show server variables
		//https://dev.mysql.com/doc/refman/8.0/en/show-variables.html
		variables: {
			rest: "GET /:id/variables",
			permissions: ['mysql.servicers.variables'],
			params: {
				id: { type: "string", optional: false },
			},
			async handler(ctx) {
				const params = Object.assign({}, ctx.params);

				const server = await ctx.call('v1.mysql.servers.resolve', { id: ctx.params.id });

				if (!server)
					throw new MoleculerClientError("Server not found", 404);

				return this.execQuery(server, `SHOW VARIABLES;`);
			}
		},
		// show server processlist
		// https://dev.mysql.com/doc/refman/8.0/en/show-processlist.html
		processlist: {
			rest: "GET /:id/processlist",
			permissions: ['mysql.servicers.processlist'],
			params: {
				id: { type: "string", optional: false },
			},
			async handler(ctx) {
				const params = Object.assign({}, ctx.params);

				const server = await ctx.call('v1.mysql.servers.resolve', { id: ctx.params.id });

				if (!server)
					throw new MoleculerClientError("Server not found", 404);

				return this.execQuery(server, `SHOW PROCESSLIST;`);
			}
		},
		// show server databases
		// https://dev.mysql.com/doc/refman/8.0/en/show-databases.html
		databases: {
			rest: "GET /:id/databases",
			permissions: ['mysql.servicers.databases'],
			params: {
				id: { type: "string", optional: false },
			},
			async handler(ctx) {
				const params = Object.assign({}, ctx.params);
				//find the server by id
				const server = await ctx.call('v1.mysql.servers.resolve', { id: ctx.params.id });

				if (!server)
					throw new MoleculerClientError("Server not found", 404);

				//execute the query on the server and return the result
				return this.execQuery(server, `SHOW DATABASES;`);
			}
		},
		// show k8s top for uid
		// https://kubernetes.io/docs/tasks/debug-application-cluster/resource-usage-monitoring/
		top: {
			rest: "GET /:id/top",
			permissions: ['mysql.servicers.top'],
			params: {
				id: { type: "string", optional: false },
			},
			async handler(ctx) {
				const params = Object.assign({}, ctx.params);

				const server = await ctx.call('v1.mysql.servers.resolve', { id: ctx.params.id });

				if (!server)
					throw new MoleculerClientError("Server not found", 404);

				if (!server.uid)
					throw new MoleculerClientError("Server uid not found", 404);

				return ctx.call('v1.kube.top', {
					uid: server.uid,
				})
			}
		},

		// provison a new mysql server through v1.kube.createNamespacedDeployment
		// https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.18/#createnamespaceddeployment-v1-apps
		provision: {
			rest: "POST /provision",
			permissions: ['mysql.servicers.provision'],
			params: {
				k8sCluster: { type: "string", optional: false },
				namespace: { type: "string", optional: false },
				zone: { type: "string", optional: true },
			},
			async handler(ctx) {
				const params = Object.assign({}, ctx.params);

				//generate a random name for the server
				const name = this.generateServerName();

				//create a new server object
				const server = {
					k8sCluster: params.k8sCluster,
					namespace: params.namespace,
					name: name,
					hostname: `${name}.${params.namespace}.svc.${this.config["mysql.servers.url"]}`,
					port: 3306,
					username: "root",
					password: this.generatePassword(),
					zone: params.zone
				}

				//save the server to the database
				const savedServer = await this.createEntity(ctx, { ...server });
				this.logger.info(`savedServer: `, savedServer);

				//create a new deployment
				const deployment = await this.createKubernetesDeployment(server);
				this.logger.info(`created deploymant ${deployment.metadata.name}`)

				//create a new configmap
				const configMap = await this.createConfigMap(server);
				this.logger.info(`created configmap ${configMap.metadata.name}`);

				//create a new secret
				const secret = await this.createSecret(server);
				this.logger.info(`created secret ${secret.metadata.name}`);

				//create a new persistent volume claim
				const persistentVolumeClaim = await this.createPersistentVolumeClaim(server);
				this.logger.info(`created persistent volume claim ${persistentVolumeClaim.metadata.name}`);

				//create a new service
				const service = await this.createService(server);
				this.logger.info(`created service ${service.metadata.name}`);

				//create the deployment
				const deploymentResult = await ctx.call('v1.kube.createNamespacedDeployment', {
					cluster: server.k8sCluster,
					namespace: server.namespace,
					body: deployment
				});

				//create the configmap
				const configMapResult = await ctx.call('v1.kube.createNamespacedConfigMap', {
					cluster: server.k8sCluster,
					namespace: server.namespace,
					body: configMap
				});

				//create the secret
				const secretResult = await ctx.call('v1.kube.createNamespacedSecret', {
					cluster: server.k8sCluster,
					namespace: server.namespace,
					body: secret
				});

				//create the persistent volume claim
				const persistentVolumeClaimResult = await ctx.call('v1.kube.createNamespacedPersistentVolumeClaim', {
					cluster: server.k8sCluster,
					namespace: server.namespace,
					body: persistentVolumeClaim
				});

				//create the service
				const serviceResult = await ctx.call('v1.kube.createNamespacedService', {
					cluster: server.k8sCluster,
					namespace: server.namespace,
					body: service
				});

				this.logger.info(`All resources created successfully`);

				//return the saved server
				return savedServer;
			}
		},
		// deprovision deployment from k8scluster
		// https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.18/#deletenamespaceddeployment-v1-apps
		deprovision: {
			rest: "POST /deprovision",
			permissions: ['mysql.servicers.deprovision'],
			params: {
				id: { type: "string", optional: false },
			},
			async handler(ctx) {
				const params = Object.assign({}, ctx.params);

				//find the server
				const server = await this.findEntity(ctx, { query: { id: params.id } });

				if (!server)
					throw new MoleculerClientError("Server not found", 404);

				//delete the deployment
				const deploymentResult = await ctx.call('v1.kube.deleteNamespacedDeployment', {
					cluster: server.k8sCluster,
					namespace: server.namespace,
					name: server.name
				});
				this.logger.info(`deleted deploymant ${deploymentResult.metadata.name}`);

				//delete the configmap
				const configMapResult = await ctx.call('v1.kube.deleteNamespacedConfigMap', {
					cluster: server.k8sCluster,
					namespace: server.namespace,
					name: `${server.name}-config`
				});
				this.logger.info(`deleted configmap ${configMapResult.metadata.name}`);

				//delete the secret
				const secretResult = await ctx.call('v1.kube.deleteNamespacedSecret', {
					cluster: server.k8sCluster,
					namespace: server.namespace,
					name: `${server.name}-secrets`
				});
				this.logger.info(`deleted secret ${secretResult.metadata.name}`);

				//delete the persistent volume claim
				const persistentVolumeClaimResult = await ctx.call('v1.kube.deleteNamespacedPersistentVolumeClaim', {
					cluster: server.k8sCluster,
					namespace: server.namespace,
					name: `${server.name}-pv-claim`
				});
				this.logger.info(`deleted persistent volume claim ${persistentVolumeClaimResult.metadata.name}`);

				//delete the service
				const serviceResult = await ctx.call('v1.kube.deleteNamespacedService', {
					cluster: server.k8sCluster,
					namespace: server.namespace,
					name: server.name
				});
				this.logger.info(`deleted service ${serviceResult.metadata.name}`);

				//delete the server from the database
				const deletedServerID = await this.removeEntity(ctx, { id: params.id });
				this.logger.info(`deprovisioned server ${deletedServerID}`);


				return deletedServerID;
			}
		},

	},

	/**
	 * Events
	 */
	events: {
		// on new deployment updated uid for fast lookup
		async "kube.deployments.added"(ctx) {
			const deploymant = ctx.params.data;

			//check if the deployment name, namespace and cluster match a server
			const server = await this.findEntity(ctx, {
				query: {
					name: deploymant.metadata.name,
					namespace: deploymant.metadata.namespace,
					k8sCluster: ctx.params.cluster
				}
			});

			if (!server)
				return;

			//update the server uid
			await this.updateEntity(ctx, {
				id: server.id,
				uid: deploymant.metadata.uid
			});

			this.logger.info(`Server ${server.name} updated with uid ${deploymant.metadata.uid}`);
		}
	},

	/**
	 * Methods
	 */
	methods: {
		/**
		 * Create a Deployment for a MySQL server
		 * 
		 * @param {Object} server 
		 * @param {String} server.name	Name of the server
		 * @param {String} server.hostname	Hostname of the server
		 * @param {Number} server.port	Port of the server
		 * @param {String} server.username	Username of the server
		 * @param {String} server.password	Password of the server
		 * @param {String} server.zone	Zone of the server
		 * @returns {Promise}	Resolves to the created server
		 * 
		 **/
		createKubernetesDeployment(server) {
			const deploymentObject = {
				apiVersion: "apps/v1",
				kind: "Deployment",
				metadata: {
					name: server.name,
				},
				spec: {
					selector: {
						matchLabels: {
							app: server.name,
						},
					},
					strategy: {
						type: "Recreate",
					},
					template: {
						metadata: {
							labels: {
								app: server.name,
							},
						},
						spec: {
							affinity: this.createaffinity(server),
							containers: [
								{
									image: "mysql:5.7",
									args: ["--ignore-db-dir=lost+found"],
									name: "mysql",
									resources: {
										limits: {
											cpu: "500m",
											memory: "512M",
										},
										requests: {
											cpu: "50m",
											memory: "256M",
										},
									},
									env: [{
										name: "MYSQL_ROOT_PASSWORD",
										valueFrom: {
											secretKeyRef: {
												name: `${server.name}-secrets`,
												key: "ROOT_PASSWORD",
											},
										},
									}],
									ports: [{
										containerPort: 3306,
										name: "mysql",
									}],
									volumeMounts: [{
										name: "config",
										mountPath: "/etc/mysql/conf.d/",
									}, {
										name: "persistent-storage",
										mountPath: "/var/lib/mysql",
									}],
								},
							],
							volumes: [{
								name: "config",
								configMap: {
									name: `${server.name}-config`,
									items: [{
										key: "mysql.cnf",
										path: "mysql.cnf",
									}],
								},
							}, {
								name: "persistent-storage",
								persistentVolumeClaim: {
									claimName: `${server.name}-pv-claim`,
								},
							}],
						},
					},
				},
			}

			return deploymentObject;
		},

		livnessProbe(server) {
			const livnessProbe = {
				exec: {
					command: [
						"/bin/sh",
						"-c",
						`mysqladmin ping -h`,
					],
				},
				initialDelaySeconds: 30,
				periodSeconds: 10,
				timeoutSeconds: 5,
				successThreshold: 1,
				failureThreshold: 3,
			}
			return livnessProbe;
		},
		readinessProbe(server) {
			const readinessProbe = {
				exec: {
					command: [
						"/bin/sh",
						"-c",
						`mysqladmin ping -h`,
					],
				},
				initialDelaySeconds: 5,
				periodSeconds: 2,
				timeoutSeconds: 1,
				successThreshold: 1,
				failureThreshold: 3,
			}
			return readinessProbe;
		},
		createaffinity(server) {
			const afinity = {
				nodeAffinity: {
					requiredDuringSchedulingIgnoredDuringExecution: {
						nodeSelectorTerms: [{
							matchExpressions: [{
								key: "k8s.one-host.ca/roles-database",
								operator: "In",
								values: ["true"],
							}],
						}],
					},
				},
			}
			if (server.zone) {
				afinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[0].matchExpressions.push({
					key: "k8s.one-host.ca/zone",
					operator: "In",
					values: [server.zone],
				})
			}
			return afinity;
		},
		createConfigMap(server) {
			const configMapObject = {
				apiVersion: "v1",
				kind: "ConfigMap",
				metadata: {
					name: `${server.name}-config`,
					labels: {
						app: "mysql",
					},
				},
				data: {
					"mysql.cnf": `# Apply this config only on the leader.
[mysqld]
sql_mode="NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION"
`,
				},
			};
			return configMapObject;
		},
		createSecret(server) {
			const secretObject = {
				apiVersion: "v1",
				kind: "Secret",
				metadata: {
					name: `${server.name}-secrets`,
				},
				type: "Opaque",
				data: {
					ROOT_PASSWORD: Buffer.from(server.password).toString("base64"),
				},
			};
			return secretObject;
		},
		createPersistentVolumeClaim(server) {

			let storageClassName = undefined;
			if (this.config["mysql.servers.storageClassName"]){
				storageClassName = this.config["mysql.servers.storageClassName"];
			}

			const persistentVolumeClaimObject = {
				apiVersion: "v1",
				kind: "PersistentVolumeClaim",
				metadata: {
					name: `${server.name}-pv-claim`,
				},
				spec: {
					storageClassName: storageClassName,
					accessModes: ["ReadWriteOnce"],
					resources: {
						requests: {
							storage: "1Gi",
						},
					},
				},
			};
			return persistentVolumeClaimObject;
		},
		createService(server) {
			const serviceObject = {
				apiVersion: "v1",
				kind: "Service",
				metadata: {
					name: server.name,
				},
				spec: {
					ports: [{
						port: 3306,
					},],
					selector: {
						app: server.name,
					},
				},
			};
			return serviceObject;
		},
		generateServerName() {
			//generate a random name for the server
			const adjectives = ["Red", "Blue", "Green", "Yellow", "Silver", "Golden", "Crimson", "Azure"];
			const nouns = ["Dragon", "Phoenix", "Sphinx", "Centaur", "Minotaur", "Griffin", "Basilisk", "Kraken"];

			const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
			const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
			return `${randomAdjective}-${randomNoun}`;
		},
		generatePassword() {
			//password must be 10 characters long and 
			//contain at least one number and one symbol
			return generator.generate({
				length: 10,
				numbers: true,
				symbols: true,
				strict: true,
			});
		}


	},

	/**
	 * Service created lifecycle event handler
	 */
	created() { },

	/**
	 * Service started lifecycle event handler
	 */


	/**
	 * Service stopped lifecycle event handler
	 */
	stopped() { }
};