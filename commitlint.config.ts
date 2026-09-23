export default {
	extends: ["@commitlint/config-conventional"],
	rules: {
		"scope-enum": [
			1,
			"always",
			[
				"api",
				"auth",
				"worker",
				"web",
				"db",
				"config",
				"core",
				"queue",
				"integrations",
				"infra",
				"ci",
				"deps",
				"docs",
			],
		],
	},
};
