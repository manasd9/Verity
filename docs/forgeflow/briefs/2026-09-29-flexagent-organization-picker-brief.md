# FlexAgent organization picker

After a user signs in to FlexAgent, Eval Tool loads active organizations from `POST /v1/org/list` using the encrypted local access token. The Settings page shows organization names, saves the selected organization, and only then loads that organization's agents.

Changing organizations removes the previously selected FlexAgent target so an evaluation cannot accidentally use an agent from another organization. The browser never receives the FlexAgent access token or password.

Checks: local HTTP test covers filtering active organizations, organization selection, and agent loading after selection.
