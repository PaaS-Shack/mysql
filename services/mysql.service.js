"use strict";
const ConfigLoader = require("config-mixin");
const mysql = require('mysql2');
const { MoleculerClientError } = require("moleculer").Errors;
const generator = require('generate-password');

/**
 * attachments of addons service
 */
module.exports = {
	name: "mysql",
	version: 1,

	mixins: [
		ConfigLoader(['mysql.**'])
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

	},

	/**
	 * Actions
	 */

	actions: {

		createUser: {
			params: {
				database: { type: "string", min: 3, optional: false },
				username: { type: "string", min: 3, optional: false },
				password: { type: "string", min: 3, optional: false },
			},
			permissions: ['teams.create'],
			async handler(ctx) {
				const params = Object.assign({}, ctx.params);


				const database = await ctx.call('v1.mysql.databases.resolve', {
					id: params.database
				})
				const server = await ctx.call('v1.mysql.servers.resolve', {
					id: database.server
				})
				//GRANT SELECT, INSERT, UPDATE, DELETE on [Database].* TO '[mysql_user]'@'[Hostname]' IDENTIFIED BY '[PASSWORD]';

				let user = await ctx.call('v1.mysql.users.getUser', {
					username: params.username,
					password: params.password,
					database: database.id
				})

				if (user) {
					return user
				}
				user = await ctx.call('v1.mysql.users.create', {
					username: params.username,
					password: params.password,
					database: database.id
				})

				var connection = mysql.createConnection({
					host: server.hostname,
					port: server.port,
					user: 'root',
					password: server.password,
					//database:'LjSWV7RZ3ezm5HtTBbYa'
				});

				connection.connect();

				const promise = new Promise((resolve, reject) => {
					//
					connection.query(`CREATE USER '${user.username}'@'%' IDENTIFIED BY '${user.password}';`, function (error, results, fields) {
						if (error) reject(error);
						else {
							connection.query(`GRANT CREATE VIEW, ALTER, SHOW VIEW, CREATE, INSERT, SELECT, DELETE, TRIGGER, REFERENCES, UPDATE, DROP, INDEX on ${database.name}.* TO '${user.username}'@'%';`, function (error, results, fields) {

								if (error) reject(error);
								else resolve(user);
							});
						}
						connection.end();
					});
				})

				return promise
			}
		},
		pack: {
			params: {
				id: { type: "string", min: 3, optional: false },
			},
			permissions: ['teams.create'],
			async handler(ctx) {
				const params = Object.assign({}, ctx.params);

				const user = await ctx.call('v1.mysql.users.resolve', {
					id: params.id
				})

				const database = await ctx.call('v1.mysql.databases.resolve', {
					id: user.database
				})

				const server = await ctx.call('v1.mysql.servers.resolve', {
					id: database.server
				})

				return {
					MYSQL_USERNAME: user.username,
					MYSQL_PASSWORD: user.password,
					MYSQL_DATABASE: database.name,
					MYSQL_HOST: server.hostname,
					MYSQL_PORT: `${server.port}`,
					MYSQL_URI: `mysql://${user.username}:${user.password}@${server.hostname}:${server.port}/${database.name}`
				};
			}
		},
		provision: {
			params: {
				id: { type: "string", optional: true },
				zone: { type: "string", optional: true },
				prefix: { type: "string", default: 'provision', optional: true },
			},
			permissions: ['teams.create'],
			async handler(ctx) {
				const params = Object.assign({}, ctx.params);

				const name = `${params.prefix}_${generator.generate({
					length: 4,
					numbers: true
				})}`;
				let username = `${params.prefix}_${generator.generate({
					length: 4,
					numbers: true
				})}`;
				let password = generator.generate({
					length: 20,
					numbers: true
				})

				let server = await ctx.call('v1.mysql.servers.find', {
					query: {
						zone: params.zone
					}
				}).then((res) => res.shift())

				if (!server) {
					server = await ctx.call('v1.mysql.servers.find', {}).then((res) => res.shift())
				}


				if (!server) {
					throw new Error('NO MYSQL SERVER')
				}


				const database = await ctx.call('v1.mysql.databases.create', {
					server: server.id,
					name
				});

				const user = await ctx.call('v1.mysql.users.create', {
					database: database.id,
					username,
					password
				});
				return user
			}
		},
		deprovision: {
			params: {
				id: { type: "string", optional: false }
			},
			permissions: ['teams.create'],
			async handler(ctx) {
				const params = Object.assign({}, ctx.params);


				const user = await ctx.call('v1.mysql.users.resolve', {
					id: params.id
				})


				return this.actions.dropDatabases({
					id: user.database
				}, { parentCtx: ctx })
			}
		},
		showQuestions: {
			params: {
				id: { type: "string", optional: false }
			},
			permissions: ['teams.create'],
			async handler(ctx) {
				const params = Object.assign({}, ctx.params);

				const server = await ctx.call('v1.mysql.servers.resolve', {
					id: params.id
				})

				var connection = mysql.createConnection({
					host: server.hostname,
					port: server.port,
					user: 'root',
					password: server.password,
					//database:'LjSWV7RZ3ezm5HtTBbYa'
				});

				connection.connect();

				const promise = new Promise((resolve, reject) => {
					connection.query(`SHOW GLOBAL STATUS LIKE '%slow%';`, function (error, results, fields) {
						if (error) reject(error);
						else resolve(results);

						connection.end();
					});
				})

				return promise
			}
		},
		uri: {
			params: {
				user: { type: "string", min: 3, optional: false },
			},
			permissions: ['teams.create'],
			async handler(ctx) {
				const params = Object.assign({}, ctx.params);

				const user = await ctx.call('v1.mysql.users.resolve', {
					id: params.user
				})

				const database = await ctx.call('v1.mysql.databases.resolve', {
					id: user.database
				})

				const server = await ctx.call('v1.mysql.servers.resolve', {
					id: database.server
				})

				return {
					user,
					database,
					server,
					uri: `mysql://${user.username}:${user.password}@${server.hostname}:${server.port}/${database.name}`
				}
			}
		},
		createDatabase: {
			params: {
				server: { type: "string", min: 3, optional: false },
				name: { type: "string", min: 3, optional: false },
			},
			permissions: ['teams.create'],
			async handler(ctx) {
				const params = Object.assign({}, ctx.params);


				const server = await ctx.call('v1.mysql.servers.resolve', {
					id: params.server
				})

				if (!server.hostname && !server.port) {
					throw new MoleculerClientError(
						`MYSQL server ${params.server} is not running`,
						403,
						"ERR_NO_CONTAINER_RUN",
						{ server: params.server }
					);
				}


				let database = await ctx.call('v1.mysql.databases.getDatabase', {
					name: params.name,
					server: server.id
				})

				if (database) {
					return database
				}

				database = await ctx.call('v1.mysql.databases.create', {
					name: params.name,
					server: server.id
				})


				var connection = mysql.createConnection({
					host: server.hostname,
					port: server.port,
					user: 'root',
					password: server.password,
					//database:'LjSWV7RZ3ezm5HtTBbYa'
				});

				connection.connect();

				const promise = new Promise((resolve, reject) => {
					connection.query(`CREATE DATABASE ${database.name};`, function (error, results, fields) {
						if (error) reject(error);
						else resolve(database);
					});
				})

				connection.end();
				return promise
			}
		},

		showUsers: {
			params: {
				id: { type: "string", min: 3, optional: false },
			},
			permissions: ['teams.create'],
			async handler(ctx) {
				const params = Object.assign({}, ctx.params);


				const server = await ctx.call('v1.mysql.servers.resolve', {
					id: params.id
				})

				var connection = mysql.createConnection({
					host: server.hostname,
					port: server.port,
					user: 'root',
					password: server.password,
					//database:'LjSWV7RZ3ezm5HtTBbYa'
				});

				connection.connect();

				return new Promise((resolve, reject) => {

					connection.query('select host, user from mysql.user', function (error, results, fields) {
						if (error) return reject(error);
						resolve(results);
					});

					connection.end();
				})
			}
		},

		showDatabases: {
			params: {
				id: { type: "string", min: 3, optional: false },
			},
			permissions: ['teams.create'],
			async handler(ctx) {
				const params = Object.assign({}, ctx.params);


				const server = await ctx.call('v1.mysql.servers.resolve', {
					id: params.id
				})

				var connection = mysql.createConnection({
					host: server.hostname,
					port: server.port,
					user: 'root',
					password: server.password,
					//database:'LjSWV7RZ3ezm5HtTBbYa'
				});

				connection.connect();

				return new Promise((resolve, reject) => {

					connection.query('show databases;', function (error, results, fields) {
						if (error) return reject(error);
						resolve(results);
					});

					connection.end();
				})
			}
		},
		dropUser: {
			params: {
				id: { type: "string", min: 3, optional: false },
			},
			permissions: ['teams.create'],
			async handler(ctx) {
				const params = Object.assign({}, ctx.params);



				const user = await ctx.call('v1.mysql.users.resolve', {
					id: params.id
				})

				const database = await ctx.call('v1.mysql.databases.resolve', {
					id: user.database
				})

				const server = await ctx.call('v1.mysql.servers.resolve', {
					id: database.server
				})

				var connection = mysql.createConnection({
					host: server.hostname,
					port: server.port,
					user: 'root',
					password: server.password,
					//database:'LjSWV7RZ3ezm5HtTBbYa'
				});

				connection.connect();

				return new Promise((resolve, reject) => {

					connection.query(`DROP USER ${user.username}`, function (error, results, fields) {
						if (error) return reject(error);

						ctx.call('v1.mysql.users.remove', {
							id: user.id
						}).catch(reject).then(() => resolve(results));
					});

					connection.end();
				})

			}
		},
		dropDatabases: {
			params: {
				id: { type: "string", min: 3, optional: false },
			},
			permissions: ['teams.create'],
			async handler(ctx) {
				const params = Object.assign({}, ctx.params);


				const database = await ctx.call('v1.mysql.databases.resolve', {
					id: params.id
				})

				const users = await ctx.call('v1.mysql.users.find', {
					query: {
						database: database.id
					}
				});


				for (let index = 0; index < users.length; index++) {
					const user = users[index];
					await this.actions.dropUser({
						id: user.id
					}, { parentCtx: ctx })
				}


				const server = await ctx.call('v1.mysql.servers.resolve', {
					id: database.server
				})

				var connection = mysql.createConnection({
					host: server.hostname,
					port: server.port,
					user: 'root',
					password: server.password,
					//database:'LjSWV7RZ3ezm5HtTBbYa'
				});

				connection.connect();

				return new Promise((resolve, reject) => {

					connection.query(`DROP DATABASE ${database.name}`, function (error, results, fields) {
						if (error) return reject(error);


						ctx.call('v1.mysql.databases.remove', {
							id: database.id
						}).catch(reject).then(() => resolve(results));
					});

					connection.end();
				})
			}
		},

		removeServer: {
			params: {
				id: { type: "string", optional: false },
			},
			permissions: ['teams.create'],
			async handler(ctx) {
				const params = Object.assign({}, ctx.params);

				const server = await ctx.call('v1.mysql.servers.resolve', {
					id: params.id
				})
				const objects = [
					await this.secretMap(params.name, password),
					await this.createDeployment(params.name, params.zone),
					await this.createPVC(params.name),
					await this.createService(params.name),
					await this.configMap(params.name),
				]

				for (let index = 0; index < objects.length; index++) {
					const element = objects[index];
					await ctx.call(`v1.kube.deleteNamespaced${element.kind}`, {
						namespace: 'mysql',
						config: 'cloud1',
						name: element.metadata.name
					})
				}
			}
		},

		createServer: {
			params: {
				name: { type: "string", lowercase: true, trim: true, optional: false },
				zone: { type: "enum", values: ["ca", "eu"], default: 'ca', optional: true },
			},
			permissions: ['teams.create'],
			async handler(ctx) {
				const params = Object.assign({}, ctx.params);

				await ctx.call('v1.kube.readNamespace', {
					name: 'mysql',
					config: 'cloud1'
				}).catch(() => ctx.call('v1.kube.createNamespace', {
					name: 'mysql',
					config: 'cloud1',
					body: {
						"apiVersion": "v1",
						"kind": "Namespace",
						"metadata": {
							"name": "mysql"
						}
					}
				}))

				const password = generator.generate({
					length: 20,
					numbers: true
				})

				const objects = [
					await this.secretMap(params.name, password),
					await this.createDeployment(params.name, params.zone),
					await this.createPVC(params.name),
					await this.createService(params.name),
					await this.configMap(params.name),
				]

				for (let index = 0; index < objects.length; index++) {
					const element = objects[index];
					await ctx.call(`v1.kube.createNamespaced${element.kind}`, {
						namespace: 'mysql',
						config: 'cloud1',
						body: element
					})
				}





				return ctx.call('v1.mysql.servers.create', {
					name: params.name,
					password: password,
					username: 'root',
					hostname: `${params.name}.mysql.svc.cloud.one-host.ca`,
					port: 3306,
				});
			}
		},
	},

	/**
	 * Events
	 */
	events: {
		async "docker.containers.ready"(ctx) {
			const container = ctx.params;


			const server = await ctx.call('v1.mysql.servers.find', {
				query: {
					name: 'sure-vervet-mysql:5.7',
					container: container.id
				}
			}).then((res) => res.shift());

			if (server) {
				const port = await ctx.call('v1.docker.ports.find', {
					query: {
						container: container.id
					}
				}).then((res) => res.shift());

				const evns = await ctx.call('v1.docker.envs.pack', {
					container: container.id
				})

				await ctx.call('v1.mysql.servers.update', {

					id: server.id,
					hostname: port.address,
					port: port.external,

					username: 'root',
					password: evns.MYSQL_ROOT_PASSWORD,

				})

			}


		},
		async "docker.containers.destroy"(ctx) {
			const container = ctx.params;


			const server = await ctx.call('v1.mysql.servers.find', {
				query: {
					name: 'sure-vervet-mysql:5.7',
					container: container.id
				}
			}).then((res) => res.shift());;

			if (server) {
				await ctx.call('v1.mysql.servers.update', {
					id: server.id,
					hostname: null,
					port: null,
				})
			}


		},
	},

	/**
	 * Methods
	 */
	methods: {
		async secretMap(name, password) {
			return {
				"apiVersion": "v1",
				"kind": "Secret",
				"metadata": {
					"name": `${name}-secrets`
				},
				"type": "Opaque",
				"stringData": {
					"ROOT_PASSWORD": password
				}
			}
		},
		async createDeployment(name, zone = 'ca') {
			return {
				"apiVersion": "apps/v1",
				"kind": "Deployment",
				"metadata": {
					"name": name
				},
				"spec": {
					"selector": {
						"matchLabels": {
							"app": name
						}
					},
					"strategy": {
						"type": "Recreate"
					},
					"template": {
						"metadata": {
							"labels": {
								"app": name
							}
						},
						"spec": {
							"affinity": {
								"nodeAffinity": {
									"requiredDuringSchedulingIgnoredDuringExecution": {
										"nodeSelectorTerms": [{
											"matchExpressions": [{
												"key": "k8s.one-host.ca/roles-database",
												"operator": "In",
												"values": [
													"true"
												]
											}, {
												"key": "topology.kubernetes.io/zone",
												"operator": "In",
												"values": [zone]
											}]
										}]
									}
								}
							},
							"containers": [{
								"image": "mysql:5.7",
								"name": "mysql",
								"resources": {
									"limits": {
										"cpu": "1000m",
										"memory": "1024M"
									},
									"requests": {
										"cpu": "100m",
										"memory": "100M"
									}
								},
								"env": [{
									"name": "MYSQL_ROOT_PASSWORD",
									"valueFrom": {
										"secretKeyRef": {
											"name": `${name}-secrets`,
											"key": "ROOT_PASSWORD"
										}
									}
								}],
								"ports": [{
									"containerPort": 3306,
									"name": "mysql"
								}],
								"volumeMounts": [{
									"name": "config-volume",
									"mountPath": "/etc/mysql/conf.d/"
								}, {
									"name": "mysql-persistent-storage",
									"mountPath": "/var/lib/mysql"
								}]
							}],
							"volumes": [{
								"name": "config-volume",
								"configMap": {
									"name": `${name}-config`,
									"items": [{
										"key": "mysql.cnf",
										"path": "mysql.cnf"
									}]
								}
							}, {
								"name": "mysql-persistent-storage",
								"persistentVolumeClaim": {
									"claimName": `${name}-pv-claim`
								}
							}]
						}
					}
				}
			}
		},
		async createPVC(name) {
			return {
				"apiVersion": "v1",
				"kind": "PersistentVolumeClaim",
				"metadata": {
					"name": `${name}-pv-claim`
				},
				"spec": {
					"storageClassName": "local-path",
					"accessModes": [
						"ReadWriteOnce"
					],
					"resources": {
						"requests": {
							"storage": "1Gi"
						}
					}
				}
			}
		},
		async createService(name) {
			return {
				"apiVersion": "v1",
				"kind": "Service",
				"metadata": {
					"name": name
				},
				"spec": {
					"externalIPs": [

					],
					"ports": [{
						"port": 3306,
						"targetPort": 3306
					}],
					"selector": {
						"app": name
					}
				}
			}
		},
		async configMap(name) {
			return {
				"apiVersion": "v1",
				"kind": "ConfigMap",
				"metadata": {
					"name": `${name}-config`,
					"labels": {
						"app": name
					}
				},
				"data": {
					"URI": `mysql://root:PbvrdCKvDqKBuq5oMuLC@${name}.mysql.svc.cloud.one-host.ca`,
					"mysql.cnf": "# Apply this config only on the leader.\n[mysqld]\n"
				}
			}
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