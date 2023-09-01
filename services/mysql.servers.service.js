"use strict";
const DbService = require("db-mixin");
const ConfigLoader = require("config-mixin");
const { MoleculerClientError } = require("moleculer").Errors;
const MYSQLMixin = require('./mixins/mysql.mixins');

/**
 * attachments of addons service
 */
module.exports = {
	name: "mysql.servers",
	version: 1,

	mixins: [
		DbService({}),
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
				required: false
			},
			zone: {
				type: "string",
				required: false
			},

		},

		scopes: {

		},

		defaultScopes: []
	},

	/**
	 * Actions
	 */

	actions: {
		create: {
			permissions: ['domains.records.create'],
		},
		list: {
			permissions: ['domains.records.list'],
		},

		find: {
			rest: "GET /find",
			permissions: ['domains.records.find'],
		},

		count: {
			rest: "GET /count",
			permissions: ['domains.records.count'],
		},

		get: {
			needEntity: true,
			permissions: ['domains.records.get']
		},

		update: {
			needEntity: true,
			permissions: ['domains.records.update']
		},

		replace: false,

		remove: {
			needEntity: true,
			permissions: ['domains.records.remove']
		},

		async seedDB() {
			
		},
	},

	/**
	 * Events
	 */
	events: {

	},

	/**
	 * Methods
	 */
	methods: {

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