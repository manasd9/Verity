# Agent scoped evaluation workflow

Eval Tool keeps one shared workspace selection: an active FlexAgent organization and one of its agents, or the existing local workspace. Sources, golden datasets, evaluation, results, and Technical Blueprint all use this selection. Switching it changes what is displayed; it does not reassign existing records.

Documents, websites, website snapshots, and technical documents uploaded in Eval Tool are tagged with the selected organization and agent. They are reference material for dataset generation and scoring; Eval Tool does not upload or synchronize knowledge into FlexAgent. Datasets inherit the source's scope, and evaluation results retain that scope and agent names for history. Old records without scope remain in the local workspace.

The server validates a selected FlexAgent pair before creating scoped sources and rejects evaluations where the approved dataset belongs to a different agent than the LiveKit target. Website snapshots follow the same LiveKit path as documents. The normal local model path remains available. Records remain readable after a FlexAgent login expires; creating or changing scoped records requires reconnecting.

A later FlexAgent knowledge base listing API can supply document and website candidates for the same organization and agent without changing dataset or result ownership. The current upload remains local to Eval Tool.
